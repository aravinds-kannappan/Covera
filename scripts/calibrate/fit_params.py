#!/usr/bin/env python3
"""
Fit the Monte-Carlo cost model's parameters to REAL MEPS microdata, with an
honest train / held-out split, and write the drop-in data/meps-params.json.

Why this exists
---------------
The previous data/meps-params.json constants were hand-picked "so that simulated
aggregates reproduce published MEPS aggregates," and npm run accuracy then
re-checked them against those same aggregates. That is circular. This script
replaces it with a real fit:

  TRAIN   = MEPS 2021 (h233) + 2022 (h243), pooled with person weights
  HOLDOUT = MEPS 2023 (h251)   <- never touched during fitting

Every parameter below is measured from the TRAIN microdata. The held-out 2023
error (scripts/calibrate/validate_holdout.ts, run next) is the honest trust
metric: it shows the fitted model generalizes to a year it never saw.

What is measured vs retained
----------------------------
The MEPS Full Year Consolidated file measures spend and event counts for five
care categories: office-based (OB), hospital outpatient (OP), emergency (ER),
inpatient (IP), and prescriptions (RX). The simulation decomposes these into 14
finer service lines (e.g. OB -> primary care, specialist, labs, ...). MEPS cannot
identify those sub-lines, so:
  - Category-level VOLUME and SPEND by age band are fit directly to MEPS.
  - The within-category MIX (relative frequency + per-event cost of each sub-line)
    is retained from the prior clinical values and rescaled so each category's
    total spend-by-band matches MEPS exactly. ER and IP are 1:1 with a category,
    so their per-event severity is set directly from MEPS.
  - Condition multipliers and planned-event add-ons are clinical priors, retained
    as-is (the consolidated file cannot identify per-condition service deltas).
The model simulates medical + Rx spend only; dental / vision / other are out of
scope, so all targets are computed over OB+OP+ER+IP+RX for an apples-to-apples fit.

Deps: pandas + numpy (offline analysis only; never imported by the app runtime,
so the Vercel bundle is unaffected). See scripts/calibrate/requirements.txt.

Usage:  python3 scripts/calibrate/fit_params.py
Output: data/meps-params.json           (recalibrated, drop-in)
        data/calibration-targets.json   (real per-year aggregates for validation)
"""
import datetime
import json
import math
import os
import sys

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.path.join(ROOT, "data", ".cache", "meps")
DATA = os.path.join(ROOT, "data")

AGE_BANDS = [(0, 17, "0-17"), (18, 44, "18-44"), (45, 64, "45-64"), (65, 200, "65+")]
BAND_KEYS = [b[2] for b in AGE_BANDS]

# MEPS Full Year Consolidated variables per data year (suffix = last two digits).
#   category -> (total expenditure var, event/visit count var)
def cat_vars(y):
    return {
        "OB": (f"OBVEXP{y}", f"OBTOTV{y}"),  # office-based visits
        "OP": (f"OPTEXP{y}", f"OPTOTV{y}"),  # hospital outpatient visits
        "ER": (f"ERTEXP{y}", f"ERTOT{y}"),   # emergency room visits
        "IP": (f"IPTEXP{y}", f"IPDIS{y}"),   # inpatient discharges
        "RX": (f"RXEXP{y}", f"RXTOT{y}"),    # prescription fills
    }

TRAIN = [("h233", "21"), ("h243", "22")]
HOLDOUT = ("h251", "23")

# Which simulation service keys roll up to each MEPS category. Every service key
# in data/meps-params.json appears exactly once.
GROUPS = {
    "OB": ["primaryCare", "specialist", "urgentCare", "mentalHealthOutpatient", "labs", "xray"],
    "OP": ["outpatientSurgery", "imagingAdvanced"],
    "ER": ["emergencyRoom"],
    "IP": ["inpatient"],
    "RX": ["genericDrugs", "preferredBrandDrugs", "nonPreferredBrandDrugs", "specialtyDrugs"],
}


def load(puf, y):
    df = pd.read_stata(os.path.join(CACHE, f"{puf}.dta"), convert_categoricals=False)
    C = {c.upper(): c for c in df.columns}
    g = lambda n: df[C[n.upper()]].astype(float).values
    d = {"w": g(f"PERWT{y}F"), "age": g("AGELAST")}
    for k, (ev, cv) in cat_vars(y).items():
        d[k + "_exp"] = g(ev)
        d[k + "_cnt"] = g(cv)
    d["med"] = sum(d[k + "_exp"] for k in cat_vars(y))  # medical + Rx total
    return d


def pool(ds):
    return {k: np.concatenate([d[k] for d in ds]) for k in ds[0]}


def band_mask(age, b):
    lo, hi = next((x[0], x[1]) for x in AGE_BANDS if x[2] == b)
    return (age >= lo) & (age <= hi)


def wmean(v, w, m=None):
    if m is not None:
        v, w = v[m], w[m]
    return float(np.average(v, weights=w)) if w.sum() > 0 else 0.0


def wmedian(v, w):
    o = np.argsort(v)
    v, w = v[o], w[o]
    cw = np.cumsum(w) / w.sum()
    return float(v[np.searchsorted(cw, 0.5)])


def severity(d, c):
    """Real per-event lognormal: (median = weighted geo-mean, sigma = weighted std of logs)."""
    exp, cnt, w = d[c + "_exp"], d[c + "_cnt"], d["w"]
    pe = np.where(cnt > 0, exp / np.maximum(cnt, 1), 0.0)
    m = pe > 0
    lv, ww = np.log(pe[m]), (w * np.maximum(cnt, 0))[m]
    mu = np.average(lv, weights=ww)
    sg = math.sqrt(np.average((lv - mu) ** 2, weights=ww))
    return round(float(np.exp(mu))), round(float(sg), 2)


def freq_by_band(d, c):
    return {b: round(wmean(d[c + "_cnt"], d["w"], band_mask(d["age"], b)), 4) for b in BAND_KEYS}


def cat_spend_by_band(d, c):
    return {b: wmean(d[c + "_exp"], d["w"], band_mask(d["age"], b)) for b in BAND_KEYS}


def concentration(d):
    med, w = d["med"], d["w"]
    o = np.argsort(-med)
    t, ww = med[o], w[o]
    cw = np.cumsum(ww) / ww.sum()
    tot = (t * ww).sum()
    share = lambda f: float((t[cw <= f] * ww[cw <= f]).sum() / tot)
    return {
        "meanAnnual": round(wmean(med, w)),
        "medianAnnual": round(wmedian(med, w)),
        "top1pct": round(share(0.01), 3),
        "top5pct": round(share(0.05), 3),
        "top10pct": round(share(0.10), 3),
        "bottom50pct": round(1 - share(0.5), 3),
    }


def age_band_mean(d):
    return {b: round(wmean(d["med"], d["w"], band_mask(d["age"], b))) for b in BAND_KEYS}


def age_shares(d):
    tot = d["w"].sum()
    return {b: round(float(d["w"][band_mask(d["age"], b)].sum() / tot), 4) for b in BAND_KEYS}


def mean_sev(median, sigma):
    """Mean of a lognormal from its median and log-sigma."""
    return median * math.exp(sigma * sigma / 2)


def fit_frailty_sigma(train, services, target_top5, seed=7, N=80000):
    """
    Pick the person-year frailty sigma whose simulated top-5% spend share best
    matches the real TRAIN concentration. Faithful numpy replication of
    lib/sim/utilization.ts sampleScenario (frailty x Poisson x lognormal, summed
    over services). Authoritative confirmation is the TS held-out validator; this
    just seeds a good value.
    """
    rng = np.random.default_rng(seed)
    shares = np.array([age_shares(train)[b] for b in BAND_KEYS])
    shares = shares / shares.sum()
    bidx = rng.choice(4, size=N, p=shares)
    best = None
    for s in [round(x, 2) for x in np.arange(1.0, 2.21, 0.1)]:
        fr = math.exp(-(s * s) / 2) * np.exp(s * rng.standard_normal(N))  # mean-1 frailty
        tot = np.zeros(N)
        for key, sp in services.items():
            fb = sp["freq"]
            rate = np.array([fb[BAND_KEYS[i]] for i in bidx]) * fr
            cnt = rng.poisson(np.maximum(rate, 0))
            idx = np.repeat(np.arange(N), cnt)
            if len(idx):
                draws = sp["allowedMedian"] * np.exp(sp["allowedSigma"] * rng.standard_normal(len(idx)))
                np.add.at(tot, idx, draws)
        o = np.argsort(-tot)
        tt = tot[o]
        n5 = max(1, int(0.05 * len(tt)))
        share5 = float(tt[:n5].sum() / tt.sum())
        err = abs(share5 - target_top5)
        if best is None or err < best[1]:
            best = (s, err, round(share5, 3))
    return best  # (sigma, abs_err, simulated_top5)


def main():
    if not all(os.path.exists(os.path.join(CACHE, f"{p}.dta")) for p, _ in TRAIN + [HOLDOUT]):
        print("Missing MEPS files. Run: python3 scripts/calibrate/fetch_meps.py", file=sys.stderr)
        return 1

    print("Loading MEPS microdata...")
    train = pool([load(p, y) for p, y in TRAIN])
    holdout = load(*HOLDOUT)

    # Structural prior: keep the current within-category service mix, conditions,
    # and planned events; rescale service volume/spend to the MEPS fit below.
    with open(os.path.join(DATA, "meps-params.json")) as f:
        prior = json.load(f)
    services = {k: dict(v) for k, v in prior["services"].items()}

    # --- Fit each service line ------------------------------------------------
    for c, keys in GROUPS.items():
        real_spend_b = cat_spend_by_band(train, c)
        if len(keys) == 1:
            # 1:1 with a MEPS category: take real per-event severity + real freq.
            key = keys[0]
            med, sg = severity(train, c)
            fb = freq_by_band(train, c)
            services[key]["allowedMedian"] = med
            services[key]["allowedSigma"] = sg
            services[key]["freq"] = {b: round(fb[b], 4) for b in BAND_KEYS}
        else:
            # Multi-line: keep each line's severity + relative mix, rescale volume
            # per band so the group's simulated mean spend == real category spend.
            for b in BAND_KEYS:
                cur_group = sum(
                    services[k]["freq"][b] * mean_sev(services[k]["allowedMedian"], services[k]["allowedSigma"])
                    for k in keys
                )
                phi = real_spend_b[b] / cur_group if cur_group > 0 else 1.0
                for k in keys:
                    services[k]["freq"][b] = round(services[k]["freq"][b] * phi, 4)

    conc_train = concentration(train)
    frailty_sigma, ferr, fsim = fit_frailty_sigma(train, services, conc_train["top5pct"])
    print(f"Fitted frailty sigma = {frailty_sigma}  (sim top5% {fsim} vs real {conc_train['top5pct']})")

    # --- Assemble recalibrated params ----------------------------------------
    params = dict(prior)
    params["_provenance"] = {
        "source": "Fit to AHRQ MEPS Household Component Full Year Consolidated microdata: TRAIN = 2021 (HC-233) + 2022 (HC-243), HOLDOUT = 2023 (HC-251).",
        "method": "Per-service-category frequency (Poisson) and per-event severity (lognormal) fit by MEPS person weights on the 2021+2022 pooled train split; within-category service mix retained from clinical priors and rescaled so each category's spend-by-age-band matches MEPS. Frailty sigma fit so simulated top-5% spend share matches the real train concentration. Held-out 2023 error is reported in data/calibration-report.json.",
        "note": "Population calibration constants, not individual records. Targets cover medical + Rx (OB+OP+ER+IP+RX); dental/vision/other are outside the simulation's scope. Regenerate with npm run calibrate; roll forward by adding the 2024 file to scripts/calibrate/fetch_meps.py when it releases (Aug 2026).",
        "trainSplit": "MEPS 2021 (HC-233) + 2022 (HC-243)",
        "holdoutSplit": "MEPS 2023 (HC-251)",
    }
    params["concentration"] = conc_train
    params["frailty"] = {"sigma": frailty_sigma, "note": prior["frailty"].get("note", "")}
    abm = age_band_mean(train)
    params["ageBands"] = [
        {"key": b, "min": lo, "max": (120 if b == "65+" else hi), "meanAnnualSpend": abm[b]}
        for lo, hi, b in AGE_BANDS
    ]
    params["services"] = services  # conditions + plannedEvents carried from prior

    with open(os.path.join(DATA, "meps-params.json"), "w") as f:
        json.dump(params, f, indent=2)
    print("Wrote data/meps-params.json")

    # --- Emit real per-year aggregates for the TS held-out validator ----------
    targets = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "note": "Real MEPS aggregates over medical+Rx (OB+OP+ER+IP+RX), person-weighted. The TS validator simulates from the fitted params and compares to these.",
        "train": {
            "years": [2021, 2022],
            "ageBandMean": age_band_mean(train),
            "ageShares": age_shares(train),
            "concentration": conc_train,
        },
        "holdout": {
            "year": 2023,
            "ageBandMean": age_band_mean(holdout),
            "ageShares": age_shares(holdout),
            "concentration": concentration(holdout),
        },
    }
    with open(os.path.join(DATA, "calibration-targets.json"), "w") as f:
        json.dump(targets, f, indent=2)
    print("Wrote data/calibration-targets.json")
    print("\nNext: npm run calibrate:validate  (npx tsx scripts/calibrate/validate_holdout.ts)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

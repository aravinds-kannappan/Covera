#!/usr/bin/env python3
"""
Ingest the real CMS Health Insurance Exchange Public Use Files (PY2026) into the
normalized Plan schema used by the app. Runs locally only; the app ships just the
compact JSON output. Source: https://data.healthcare.gov/datafile/py2026/

  Plan_Attributes_PUF.csv      -> plan metadata, deductible, MOOP, AV, HSA, SBC
  Rate_PUF.csv                 -> unsubsidized premium by age (avg across rating areas)
  Benefits_Cost_Sharing_PUF.csv-> per-service copay / coinsurance (parsed from strings)

Usage:  python3 scripts/ingest_pufs.py [TX FL GA]
"""
import csv, json, os, re, sys
from collections import defaultdict

csv.field_size_limit(10_000_000)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "data", ".cache")
OUT = os.path.join(ROOT, "data")
PLAN_YEAR = 2026
SOURCE = "CMS Health Insurance Exchange Public Use Files, PY2026 (data.healthcare.gov)"

STATES = [s.upper() for s in (sys.argv[1:] or ["TX", "FL", "NC", "OH"])]
METALS = {"Bronze", "Expanded Bronze", "Silver", "Gold", "Platinum", "Catastrophic"}

# Real Benefits&CostSharing PUF benefit names -> our service keys (case-insensitive substring).
BENEFIT_MAP = [
    ("primary care visit to treat an injury or illness", "primaryCare"),
    ("specialist visit", "specialist"),
    ("urgent care centers or facilities", "urgentCare"),
    ("emergency room services", "emergencyRoom"),
    ("inpatient hospital services", "inpatient"),
    ("outpatient facility fee", "outpatientSurgery"),
    ("outpatient surgery physician/surgical services", "outpatientSurgery"),
    ("laboratory outpatient and professional services", "labs"),
    ("x-rays and diagnostic imaging", "xray"),
    ("imaging (ct/pet scans, mris)", "imagingAdvanced"),
    ("mental/behavioral health outpatient", "mentalHealthOutpatient"),
    ("outpatient mental health", "mentalHealthOutpatient"),
    ("generic drugs", "genericDrugs"),
    ("preferred brand drugs", "preferredBrandDrugs"),
    ("non-preferred brand drugs", "nonPreferredBrandDrugs"),
    ("specialty drugs", "specialtyDrugs"),
]


def money(s):
    if s is None:
        return None
    s = s.strip()
    if s == "" or s.lower() in ("not applicable", "n/a"):
        return None
    s = s.replace("$", "").replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def parse_share(copay_str, coins_str):
    """Parse the PUF copay/coinsurance strings into a structured cost share."""
    ct = (copay_str or "").strip()
    nt = (coins_str or "").strip()
    cl, nl = ct.lower(), nt.lower()
    if (ct == "" or cl == "not applicable") and (nt == "" or nl == "not applicable"):
        return None
    after = ("after deductible" in cl) or ("after deductible" in nl)
    before = ("before deductible" in cl) or ("before deductible" in nl)
    no_charge = ("no charge" in cl) or ("no charge" in nl)

    cm = re.search(r"\$?\s*([0-9][0-9,]*\.?[0-9]*)", ct) if ct else None
    copay = float(cm.group(1).replace(",", "")) if cm else None
    sm = re.search(r"([0-9]+\.?[0-9]*)\s*%", nt) if nt else None
    coins = float(sm.group(1)) / 100.0 if sm else None

    if no_charge and copay is None and coins is None:
        copay, coins = 0.0, 0.0
    after_ded = bool(after) if (after or before) else False
    is_no_charge = no_charge and not copay and not coins
    return {
        "copay": copay,
        "coinsurance": coins,
        "afterDeductible": after_ded,
        "noCharge": bool(is_no_charge),
    }


def map_benefit(name):
    n = name.strip().lower()
    for needle, key in BENEFIT_MAP:
        if needle in n:
            return key
    return None


def load_plan_attributes():
    path = os.path.join(CACHE, "Plan_Attributes_PUF.csv")
    plans = {}
    with open(path, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            if r.get("StateCode") not in STATES:
                continue
            if r.get("DentalOnlyPlan") != "No":
                continue
            if r.get("MarketCoverage") != "Individual":
                continue
            if r.get("MetalLevel") not in METALS:
                continue
            pid = (r.get("PlanId") or "").strip()
            if not pid.endswith("-01"):  # standard on-exchange variant
                continue
            scid = (r.get("StandardComponentId") or "").strip()
            ded = money(r.get("TEHBDedInnTier1Individual")) or money(
                r.get("MEHBDedInnTier1Individual")
            )
            moop = money(r.get("TEHBInnTier1IndividualMOOP")) or money(
                r.get("MEHBInnTier1IndividualMOOP")
            )
            if ded is None or moop is None:
                continue
            av = money(r.get("AVCalculatorOutputNumber"))
            if av is not None and av > 1.5:
                av = av / 100.0
            ptype = (r.get("PlanType") or "PPO").strip().upper()
            if ptype not in ("HMO", "PPO", "EPO", "POS", "INDEMNITY"):
                ptype = "PPO"

            def sbc(prefix):
                d = money(r.get(prefix + "Deductible"))
                c = money(r.get(prefix + "Copayment"))
                co = r.get(prefix + "Coinsurance")
                lim = money(r.get(prefix + "Limit"))
                cm = re.search(r"([0-9]+\.?[0-9]*)\s*%", co or "")
                coins = float(cm.group(1)) / 100.0 if cm else None
                if d is None and c is None and coins is None:
                    return None
                return {"deductible": d, "copay": c, "coinsurance": coins, "limit": lim}

            plans[scid] = {
                "id": scid,
                "state": r["StateCode"],
                "issuer": (r.get("IssuerMarketPlaceMarketingName") or "").strip(),
                "marketingName": (r.get("PlanMarketingName") or "").strip(),
                "planType": "Indemnity" if ptype == "INDEMNITY" else ptype,
                "metal": r["MetalLevel"],
                "hsaEligible": r.get("IsHSAEligible") == "Yes",
                "actuarialValue": round(av, 4) if av is not None else None,
                "deductible": ded,
                "drugDeductible": money(r.get("DEHBDedInnTier1Individual")),
                "integratedMedicalDrugDeductible": r.get(
                    "MedicalDrugDeductiblesIntegrated"
                )
                == "Yes",
                "oopMax": moop,
                "premiumByAge": {},
                "costShares": {},
                "sbc": {
                    k: v
                    for k, v in {
                        "havingABaby": sbc("SBCHavingaBaby"),
                        "managingDiabetes": sbc("SBCHavingDiabetes"),
                        "simpleFracture": sbc("SBCHavingSimplefracture"),
                    }.items()
                    if v
                },
            }
    return plans


def load_rates(plans):
    path = os.path.join(CACHE, "Rate_PUF.csv")
    ids = set(plans.keys())
    acc = defaultdict(lambda: [0.0, 0])  # (planId, age) -> [sum, count]
    age_keys = set()
    with open(path, encoding="utf-8-sig", newline="") as f:
        rdr = csv.reader(f)
        hdr = next(rdr)
        ix = {c: i for i, c in enumerate(hdr)}
        i_state, i_pid, i_tob, i_age, i_rate = (
            ix["StateCode"],
            ix["PlanId"],
            ix["Tobacco"],
            ix["Age"],
            ix["IndividualRate"],
        )
        for row in rdr:
            if len(row) <= i_rate or row[i_state] not in STATES:
                continue
            pid = row[i_pid][:14]
            if pid not in ids:
                continue
            tob = row[i_tob].strip().lower()
            if "tobacco" in tob and "non" not in tob and "no preference" not in tob:
                continue  # skip tobacco-user-specific rate; keep non-tobacco / no-preference
            age = row[i_age].strip()
            if age == "" or age.lower() == "family option":
                continue
            rate = money(row[i_rate])
            if rate is None or rate <= 0 or rate > 90000:
                continue
            acc[(pid, age)][0] += rate
            acc[(pid, age)][1] += 1
            age_keys.add(age)
    for (pid, age), (s, c) in acc.items():
        if c:
            plans[pid]["premiumByAge"][age] = round(s / c, 2)
    return sorted(age_keys, key=rate_age_sort)


def rate_age_sort(a):
    m = re.search(r"\d+", a)
    return int(m.group(0)) if m else 999


def load_benefits(plans):
    path = os.path.join(CACHE, "Benefits_Cost_Sharing_PUF.csv")
    ids = set(plans.keys())
    with open(path, encoding="utf-8-sig", newline="") as f:
        rdr = csv.reader(f)
        hdr = next(rdr)
        ix = {c: i for i, c in enumerate(hdr)}
        i_state, i_scid, i_pid, i_ben, i_cop, i_coi, i_cov = (
            ix["StateCode"],
            ix["StandardComponentId"],
            ix["PlanId"],
            ix["BenefitName"],
            ix["CopayInnTier1"],
            ix["CoinsInnTier1"],
            ix["IsCovered"],
        )
        for row in rdr:
            if len(row) <= i_cov or row[i_state] not in STATES:
                continue
            if not row[i_pid].endswith("-01"):
                continue
            scid = row[i_scid].strip()
            if scid not in ids:
                continue
            key = map_benefit(row[i_ben])
            if not key or key in plans[scid]["costShares"]:
                continue
            if row[i_cov].strip().lower() not in ("covered", ""):
                continue
            share = parse_share(row[i_cop], row[i_coi])
            if share:
                plans[scid]["costShares"][key] = share


def main():
    print(f"Ingesting PY{PLAN_YEAR} PUFs for states: {', '.join(STATES)}")
    plans = load_plan_attributes()
    print(f"  plan attributes: {len(plans)} candidate plans")
    age_keys = load_rates(plans)
    plans = {k: v for k, v in plans.items() if v["premiumByAge"]}
    print(f"  with premiums:   {len(plans)} plans | {len(age_keys)} age buckets")
    load_benefits(plans)
    cs_counts = [len(p["costShares"]) for p in plans.values()]
    print(
        f"  cost shares:     avg {sum(cs_counts)/max(1,len(cs_counts)):.1f} services/plan"
    )

    os.makedirs(OUT, exist_ok=True)
    index = []
    for st in STATES:
        sp = [p for p in plans.values() if p["state"] == st]
        if not sp:
            continue
        sp.sort(key=lambda p: (p["metal"], p["issuer"], p["marketingName"]))
        ds = {
            "state": st,
            "planYear": PLAN_YEAR,
            "generatedAt": __import__("datetime").datetime.now(
                __import__("datetime").timezone.utc
            ).isoformat(),
            "source": SOURCE,
            "rateAgeKeys": age_keys,
            "plans": sp,
        }
        with open(os.path.join(OUT, f"plans.{st}.json"), "w") as f:
            json.dump(ds, f, separators=(",", ":"))
        prem = [
            p["premiumByAge"].get("40") or next(iter(p["premiumByAge"].values()))
            for p in sp
        ]
        index.append(
            {
                "state": st,
                "planCount": len(sp),
                "issuers": sorted({p["issuer"] for p in sp}),
                "premiumRange40": [round(min(prem)), round(max(prem))] if prem else None,
            }
        )
        print(
            f"  -> plans.{st}.json  ({len(sp)} plans, "
            f"{len(set(p['issuer'] for p in sp))} issuers)"
        )

    with open(os.path.join(OUT, "states.json"), "w") as f:
        json.dump(
            {"planYear": PLAN_YEAR, "source": SOURCE, "states": index}, f, indent=2
        )
    print("Done.")


if __name__ == "__main__":
    main()

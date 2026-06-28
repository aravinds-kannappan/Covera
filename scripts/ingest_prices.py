#!/usr/bin/env python3
"""Ingest real CMS procedure prices.

Pulls real national average submitted charges and Medicare allowed amounts per HCPCS code
from the CMS open-data dataset "Medicare Physician & Other Practitioners - by Geography and
Service" (data.cms.gov) and regenerates data/procedure-prices.json.

  python3 scripts/ingest_prices.py   ->   data/procedure-prices.json

What is and isn't real here (read before trusting a number):
  * avgSubmittedCharge  -> REAL CMS national average of what providers BILL for the code.
  * medicareAllowed     -> REAL CMS national average Medicare allowed amount.
  * typicalAllowed      -> for ambulatory services, estimated as medicareAllowed x a
    documented commercial multiplier (commercial allowed amounts run roughly 1.5-3x
    Medicare). Facility-dominated procedures (inpatient, surgery, ER) are marked
    facility:true and KEEP their curated commercial estimate, because this
    physician/practitioner dataset captures only the professional fee, never the
    hospital/ASC facility fee. Those await a hospital price-transparency (MRF) source.

Stdlib only; no third-party deps. Re-runnable; discovers the latest data year itself.
"""
import datetime
import json
import os
import ssl
import sys
import urllib.parse
import urllib.request

# Always verify TLS. Prefer certifi's CA bundle when installed; otherwise use the system
# default context, which honors the SSL_CERT_FILE env var (e.g. /etc/ssl/cert.pem on macOS
# if your python.org Python lacks a bundle: `SSL_CERT_FILE=/etc/ssl/cert.pem npm run ingest:prices`).
try:
    import certifi

    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    _SSL_CTX = ssl.create_default_context()

CATALOG = "https://data.cms.gov/data.json"
DATASET_TITLE = "Medicare Physician & Other Practitioners - by Geography and Service"
COMMERCIAL_MULTIPLIER = 1.8  # ambulatory commercial allowed ≈ Medicare allowed x this

DATA_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "data"))
PRICES_PATH = os.path.join(DATA_DIR, "procedure-prices.json")

# procedure id -> (HCPCS/CPT code, preferred place of service, facility-dominated?)
# "facility" marks procedures whose true cost is dominated by a hospital/ASC fee this
# physician dataset does not contain — we keep their curated estimate and only attach the
# professional figures for transparency.
HCPCS_MAP = {
    "office_pcp": ("99214", "O", False),         # established office visit, level 4
    "office_specialist": ("99204", "O", False),  # new patient office visit, level 4
    "urgent_care": ("99214", "O", False),        # closest Medicare analog to an UC visit
    "er_visit": ("99284", "O", True),            # ED pro-fee; facility fee dominates
    "mri_brain": ("70551", "O", False),          # MRI brain without contrast
    "ct_abdomen": ("74176", "O", False),         # CT abdomen & pelvis without contrast
    "xray": ("71046", "O", False),               # chest x-ray, 2 views
    "blood_panel": ("80053", "O", False),        # comprehensive metabolic panel
    "mental_health": ("90837", "O", False),      # psychotherapy, 60 min
    "colonoscopy": ("45380", "F", True),         # colonoscopy w/ biopsy (pro-fee only)
    "knee_arthroscopy": ("29881", "F", True),    # knee arthroscopy w/ meniscectomy
    "delivery": ("59400", "O", True),            # global vaginal OB (sparse in Medicare)
    "delivery_csection": ("59510", "O", True),   # global cesarean OB
    "appendectomy": ("44970", "F", True),        # laparoscopic appendectomy (pro-fee)
    "knee_replacement": ("27447", "F", True),    # total knee arthroplasty (pro-fee)
}


def http_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "covera-ingest/1.0"})
    with urllib.request.urlopen(req, timeout=90, context=_SSL_CTX) as r:
        return json.loads(r.read().decode("utf-8"))


def latest_distribution():
    """Find the most recent year's API endpoint for the dataset, from the CMS catalog."""
    cat = http_json(CATALOG)
    matches = [d for d in cat.get("dataset", []) if d.get("title") == DATASET_TITLE]
    if not matches:
        sys.exit(f"Dataset not found in CMS catalog: {DATASET_TITLE}")
    api_dists = [
        x for x in matches[0].get("distribution", []) if x.get("format") == "API"
    ]
    if not api_dists:
        sys.exit("No API distribution found for dataset")

    def year_of(dist):
        return dist.get("title", "").split(":")[-1].strip()

    api_dists.sort(key=year_of, reverse=True)
    best = api_dists[0]
    url = best.get("accessURL") or best.get("downloadURL")
    return url, year_of(best)[:4]


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def fetch_code(base_url, hcpcs, pos):
    """National row for one HCPCS code, preferring the requested place of service."""
    query = base_url + "?" + urllib.parse.urlencode(
        {
            "filter[Rndrng_Prvdr_Geo_Lvl]": "National",
            "filter[HCPCS_Cd]": hcpcs,
            "size": "100",
        }
    )
    rows = http_json(query)
    rows = [r for r in rows if num(r.get("Avg_Sbmtd_Chrg")) and num(r.get("Avg_Mdcr_Alowd_Amt"))]
    if not rows:
        return None
    preferred = [r for r in rows if r.get("Place_Of_Srvc") == pos] or rows
    preferred.sort(key=lambda r: num(r.get("Tot_Srvcs")) or 0, reverse=True)
    r = preferred[0]
    return {
        "hcpcsDesc": r.get("HCPCS_Desc"),
        "submitted": round(num(r["Avg_Sbmtd_Chrg"])),
        "allowed": round(num(r["Avg_Mdcr_Alowd_Amt"])),
        "pos": r.get("Place_Of_Srvc"),
    }


def main():
    base_url, year = latest_distribution()
    print(f"Source: {DATASET_TITLE} (data year {year})")
    print(f"API: {base_url}\n")

    with open(PRICES_PATH) as f:
        existing = json.load(f)

    out_procs = []
    enriched = 0
    for p in existing["procedures"]:
        new = dict(p)  # preserve id, label, serviceKey, and the curated typicalAllowed
        mapping = HCPCS_MAP.get(p["id"])
        if mapping:
            hcpcs, pos, facility = mapping
            got = fetch_code(base_url, hcpcs, pos)
            if got:
                enriched += 1
                new["hcpcs"] = hcpcs
                new["hcpcsDesc"] = got["hcpcsDesc"]
                new["medicareAllowed"] = got["allowed"]
                new["avgSubmittedCharge"] = got["submitted"]
                new["facility"] = facility
                if not facility:
                    new["typicalAllowed"] = round(got["allowed"] * COMMERCIAL_MULTIPLIER)
                tag = "facility (kept curated)" if facility else "ambulatory"
                print(
                    f"  {p['id']:18} {hcpcs} pos={got['pos']}  "
                    f"allowed ${got['allowed']:>6}  billed ${got['submitted']:>7}  "
                    f"-> typicalAllowed ${new['typicalAllowed']:>6}  [{tag}]"
                )
            else:
                print(f"  {p['id']:18} {hcpcs}  no Medicare data (kept curated ${p['typicalAllowed']})")
        out_procs.append(new)

    result = {
        "_provenance": {
            "source": (
                f"{DATASET_TITLE}, data year {year} — CMS open data (data.cms.gov). "
                "Real national average submitted charges and Medicare allowed amounts per HCPCS code."
            ),
            "api": base_url,
            "extractedAt": datetime.date.today().isoformat(),
            "commercialMultiplier": COMMERCIAL_MULTIPLIER,
            "method": (
                "avgSubmittedCharge and medicareAllowed are real CMS national averages for the mapped "
                "HCPCS code. For ambulatory services, typicalAllowed is estimated as medicareAllowed x "
                "commercialMultiplier (commercial allowed amounts run roughly 1.5-3x Medicare). "
                "Facility-dominated procedures are marked facility:true and keep a curated commercial "
                "estimate, because this physician/practitioner dataset captures only the professional "
                "fee, not the hospital/ASC facility fee."
            ),
        },
        "procedures": out_procs,
    }
    with open(PRICES_PATH, "w") as f:
        json.dump(result, f, indent=2)
        f.write("\n")
    print(f"\nEnriched {enriched}/{len(out_procs)} procedures with real CMS data -> data/procedure-prices.json")


if __name__ == "__main__":
    main()

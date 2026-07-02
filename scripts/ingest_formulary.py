#!/usr/bin/env python3
"""Ingest real CMS QHP drug formularies into the bundled plans.

Pipeline (all real, all public):
  Machine-Readable URL PUF  (per-issuer index.json URLs, data.healthcare.gov, PY2026)
    -> issuer index.json    (-> formulary_urls)
    -> drugs.json           (per-plan drug tier for every covered drug)

For each bundled plan we record, for a curated list of common maintenance drugs,
the tier the plan covers the drug at, or "notCovered" when the plan publishes a
formulary but does not list that drug. This is exactly the shape lib/sim/coverage.ts
consumes, so the formulary/network matcher lights up on real data.

  python3 scripts/ingest_formulary.py [STATE ...]      # default: all bundled states

Provider networks (providers.json) are intentionally NOT bundled: those files run
to hundreds of MB per issuer and are better queried on demand than shipped. The
coverage engine treats an unknown network as in-network, so nothing regresses.

Stdlib only; TLS always verified (certifi if present, else the system bundle via
SSL_CERT_FILE, e.g. `SSL_CERT_FILE=/etc/ssl/cert.pem python3 scripts/ingest_formulary.py`).
"""
import datetime
import io
import json
import os
import ssl
import sys
import urllib.request
import zipfile
import xml.etree.ElementTree as ET

try:
    import certifi

    _CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    _CTX = ssl.create_default_context()

MR_PUF_URL = "https://data.healthcare.gov/datafile/py2026/machine_readable_PUF.xlsx"
DATA_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "data"))
BUNDLED_STATES = ["TX", "FL", "NC", "OH"]
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
MAX_DRUGS_BYTES = 300_000_000  # skip a drugs file larger than this to stay in memory

# Patient-facing drug -> the substrings that identify it in a CMS drug_name. Every alias
# is emitted as a formulary key, so a patient who types the brand or the generic matches.
COMMON_DRUGS = {
    "metformin": ["metformin"],
    "glipizide": ["glipizide"],
    "glimepiride": ["glimepiride"],
    "empagliflozin": ["empagliflozin", "jardiance"],
    "semaglutide": ["semaglutide", "ozempic"],
    "insulin glargine": ["glargine", "lantus", "basaglar"],
    "lisinopril": ["lisinopril"],
    "losartan": ["losartan"],
    "amlodipine": ["amlodipine"],
    "hydrochlorothiazide": ["hydrochlorothiazide"],
    "metoprolol": ["metoprolol"],
    "atorvastatin": ["atorvastatin", "lipitor"],
    "rosuvastatin": ["rosuvastatin", "crestor"],
    "simvastatin": ["simvastatin"],
    "levothyroxine": ["levothyroxine", "synthroid"],
    "omeprazole": ["omeprazole"],
    "pantoprazole": ["pantoprazole"],
    "gabapentin": ["gabapentin"],
    "pregabalin": ["pregabalin", "lyrica"],
    "sertraline": ["sertraline", "zoloft"],
    "escitalopram": ["escitalopram", "lexapro"],
    "duloxetine": ["duloxetine", "cymbalta"],
    "bupropion": ["bupropion", "wellbutrin"],
    "albuterol": ["albuterol", "ventolin", "proair"],
    "montelukast": ["montelukast", "singulair"],
    "allopurinol": ["allopurinol"],
    "apixaban": ["apixaban", "eliquis"],
    "clopidogrel": ["clopidogrel", "plavix"],
    "prednisone": ["prednisone"],
    "adalimumab": ["adalimumab", "humira"],
    "etanercept": ["etanercept", "enbrel"],
}

TIER_RANK = {"genericDrugs": 0, "preferredBrandDrugs": 1, "nonPreferredBrandDrugs": 2, "specialtyDrugs": 3}


def http(url, timeout=120, max_bytes=None):
    req = urllib.request.Request(url, headers={"User-Agent": "covera-ingest/1.0"})
    with urllib.request.urlopen(req, timeout=timeout, context=_CTX) as r:
        if max_bytes:
            cl = r.headers.get("Content-Length")
            if cl and int(cl) > max_bytes:
                raise ValueError(f"content-length {int(cl):,} exceeds cap")
            data = r.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise ValueError(f"exceeds {max_bytes} bytes")
            return data
        return r.read()


def tier_of(cms_tier):
    """Map a CMS drug_tier string onto the app's four drug tiers."""
    u = (cms_tier or "").upper()
    if "SPECIALTY" in u:
        return "specialtyDrugs"
    if "BRAND" in u and "NON" in u:
        return "nonPreferredBrandDrugs"
    if "BRAND" in u:
        return "preferredBrandDrugs"
    return "genericDrugs"


def read_mr_puf():
    """Parse the MR-PUF xlsx (stdlib) into {issuer_id: index_url}."""
    z = zipfile.ZipFile(io.BytesIO(http(MR_PUF_URL)))
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall(NS + "si"):
            shared.append("".join(t.text or "" for t in si.iter(NS + "t")))
    sheet = sorted(n for n in z.namelist() if n.startswith("xl/worksheets/sheet"))[0]
    root = ET.fromstring(z.read(sheet))
    rows = []
    for row in root.iter(NS + "row"):
        cells = []
        for c in row.findall(NS + "c"):
            v = c.find(NS + "v")
            val = ""
            if v is not None and v.text is not None:
                val = shared[int(v.text)] if c.get("t") == "s" else v.text
            cells.append(val)
        rows.append(cells)
    hdr = [h.strip().lower() for h in rows[0]]
    ci_issuer = next(i for i, h in enumerate(hdr) if "issuer" in h)
    ci_url = next(i for i, h in enumerate(hdr) if "url" in h)
    out = {}
    for r in rows[1:]:
        if len(r) > max(ci_issuer, ci_url) and r[ci_issuer] and r[ci_url]:
            out.setdefault(str(r[ci_issuer]).strip(), str(r[ci_url]).strip())
    return out


def iter_json_array(text):
    """Yield objects from a top-level JSON array one at a time (bounded memory)."""
    dec = json.JSONDecoder()
    i = text.index("[") + 1
    n = len(text)
    while True:
        while i < n and text[i] in " \t\r\n,":
            i += 1
        if i >= n or text[i] == "]":
            return
        obj, i = dec.raw_decode(text, i)
        yield obj


def formulary_for_issuer(index_url):
    """Fetch an issuer's drugs files and return {plan_id14: {alias: tier|'notCovered'}}."""
    index = json.loads(http(index_url, timeout=60).decode("utf-8", "replace"))
    drug_urls = index.get("formulary_urls", []) if isinstance(index, dict) else []
    if not drug_urls:
        return {}
    found = {}  # pid14 -> {primary: best_tier}
    seen = set()  # every pid14 that appears in this issuer's formulary
    for du in drug_urls:
        text = http(du, timeout=110, max_bytes=MAX_DRUGS_BYTES).decode("utf-8", "replace")
        for rec in iter_json_array(text):
            name = (rec.get("drug_name") or "").lower()
            primaries = [p for p, al in COMMON_DRUGS.items() if any(a in name for a in al)]
            for pe in rec.get("plans", []):
                yrs = pe.get("years")
                if yrs and 2026 not in yrs:
                    continue
                pid = str(pe.get("plan_id", ""))[:14]
                if not pid:
                    continue
                seen.add(pid)
                if not primaries:
                    continue
                t = tier_of(pe.get("drug_tier"))
                slot = found.setdefault(pid, {})
                for p in primaries:
                    if p not in slot or TIER_RANK[t] < TIER_RANK[slot[p]]:
                        slot[p] = t
    result = {}
    for pid in seen:
        form = {}
        for primary, aliases in COMMON_DRUGS.items():
            val = found.get(pid, {}).get(primary, "notCovered")
            for a in aliases:
                form[a] = val
        result[pid] = form
    return result


def main(states):
    print("Reading Machine-Readable URL PUF ...")
    issuer_index = read_mr_puf()
    print(f"  {len(issuer_index)} issuer index URLs\n")

    for state in states:
        path = os.path.join(DATA_DIR, f"plans.{state}.json")
        if not os.path.exists(path):
            print(f"[{state}] no bundled data, skipping")
            continue
        with open(path) as f:
            dataset = json.load(f)
        plans = dataset["plans"]
        by_id = {p["id"]: p for p in plans}
        issuers = sorted({p["id"][:5] for p in plans})
        print(f"[{state}] {len(plans)} plans across {len(issuers)} issuers")

        formulary = {}  # pid14 -> form
        for iss in issuers:
            url = issuer_index.get(iss)
            if not url:
                print(f"  {iss}  no index URL in MR-PUF")
                continue
            try:
                fm = formulary_for_issuer(url)
                formulary.update(fm)
                print(f"  {iss}  {len(fm)} plans with formulary data")
            except Exception as e:  # one issuer failing must not sink the run
                print(f"  {iss}  skipped: {e}")

        matched = 0
        for pid14, form in formulary.items():
            plan = by_id.get(pid14)
            if plan:
                plan["formulary"] = form
                matched += 1

        dataset["_formularyProvenance"] = {
            "source": "CMS QHP machine-readable formularies (Machine-Readable URL PUF, PY2026, data.healthcare.gov) -> issuer index.json -> drugs.json.",
            "extractedAt": datetime.date.today().isoformat(),
            "drugsTracked": sorted(COMMON_DRUGS),
            "note": "Per-plan tier for common maintenance drugs; 'notCovered' means the plan publishes a formulary that omits the drug. Provider networks are not bundled (queried on demand).",
        }
        with open(path, "w") as f:
            json.dump(dataset, f, separators=(",", ":"))
            f.write("\n")
        print(f"[{state}] wrote formulary for {matched}/{len(plans)} plans -> data/plans.{state}.json\n")


if __name__ == "__main__":
    main([s.upper() for s in sys.argv[1:]] or BUNDLED_STATES)

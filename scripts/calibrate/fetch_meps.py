#!/usr/bin/env python3
"""
Download the real AHRQ MEPS Household Component Full Year Consolidated public-use
files used to CALIBRATE the cost simulation. Public, free, no auth. Runs locally
only; the app ships just the fitted JSON (data/meps-params.json), never the raw
microdata.

  h233 -> 2021 Full Year Consolidated (released Aug 2023)
  h243 -> 2022 Full Year Consolidated (released Aug 2024)
  h251 -> 2023 Full Year Consolidated (released Aug 2025)   <- newest that exists

MEPS has a ~2-year publication lag by design, so 2023 is the most recent data
year available (the 2024 file is scheduled for Aug 2026). We train on 2021+2022
and validate on the held-out 2023 file; see scripts/calibrate/fit_params.py.

The Stata (.dta) distribution is used because it carries its own schema (variable
names + types), so pandas.read_stata reads it directly. The SAS-transport (.ssp)
files are CPORT-compressed and are NOT plain XPORT, so pandas cannot read them.

Usage:  python3 scripts/calibrate/fetch_meps.py
Output: data/.cache/meps/h233.dta, h243.dta, h251.dta   (gitignored, re-creatable)
"""
import os
import ssl
import sys
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.path.join(ROOT, "data", ".cache", "meps")
BASE = "https://meps.ahrq.gov/data_files/pufs"

# (puf id, data year). The .dta zip lives at {BASE}/{puf}/{puf}dta.zip and unzips
# to {puf}.dta. To roll forward when the 2024 file drops, add ("h2XX", 2024).
FILES = [("h233", 2021), ("h243", 2022), ("h251", 2023)]


def download(puf: str) -> str:
    """Fetch and extract one PUF's Stata file into CACHE; return the .dta path."""
    dta = os.path.join(CACHE, f"{puf}.dta")
    if os.path.exists(dta) and os.path.getsize(dta) > 1_000_000:
        print(f"  {puf}.dta already cached ({os.path.getsize(dta) // 1_000_000} MB)")
        return dta

    url = f"{BASE}/{puf}/{puf}dta.zip"
    zpath = os.path.join(CACHE, f"{puf}dta.zip")
    print(f"  downloading {url}")
    # MEPS serves a valid cert; the unverified context mirrors the defensive
    # pattern in scripts/ingest_prices.py for environments with stale CA bundles.
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(url, context=ctx, timeout=300) as r, open(zpath, "wb") as f:
            f.write(r.read())
    except ssl.SSLError:
        ctx = ssl._create_unverified_context()
        with urllib.request.urlopen(url, context=ctx, timeout=300) as r, open(zpath, "wb") as f:
            f.write(r.read())

    with zipfile.ZipFile(zpath) as z:
        member = next((n for n in z.namelist() if n.lower().endswith(".dta")), None)
        if not member:
            raise RuntimeError(f"No .dta inside {zpath}")
        with z.open(member) as src, open(dta, "wb") as out:
            out.write(src.read())
    os.remove(zpath)
    print(f"  extracted {puf}.dta ({os.path.getsize(dta) // 1_000_000} MB)")
    return dta


def main() -> None:
    os.makedirs(CACHE, exist_ok=True)
    print(f"Fetching MEPS Full Year Consolidated files into {CACHE}")
    for puf, year in FILES:
        print(f"MEPS {puf} ({year}):")
        download(puf)
    print("\nDone. Next: python3 scripts/calibrate/fit_params.py")


if __name__ == "__main__":
    sys.exit(main())

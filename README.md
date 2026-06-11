# Covera — Insurance Optimizer

**Know what your care will actually cost — before you choose.**

Covera simulates thousands of possible years of your health against **every real
marketplace plan** in your state, then ranks them by what you'd truly pay — premium
plus out-of-pocket — and the financial risk you'd carry. It turns the one number
people pick on (the premium) into the number that matters (a distribution of all-in
cost), and puts that math in the patient's hands.

Every figure traces to public data. No synthetic plans, prices, or claims.

## What it does

- **Stochastic cost engine** — a Monte-Carlo simulation grounds your likely care use
  in real AHRQ MEPS utilization data, runs thousands of simulated years through each
  plan's actual cost-sharing rules, and ranks plans by **risk-adjusted** total cost
  (expected cost + a downside-risk penalty). Shows best/worst case, the probability
  you hit your out-of-pocket max, the cost-vs-risk efficient frontier, and what drives
  your cost.
- **Conversational what-if navigator** — describe your situation by voice or text and
  Claude builds your profile; ask anything about your plans; pose "what if I get
  pregnant / lose my job?" and Claude re-runs the real simulation and explains how the
  ranking changes.
- **Coverage Card** — a portable, patient-owned card (QR + link). A provider opens it
  to see coverage and a live point-of-care cost estimate **without touching your
  medical records**. The whole card lives in the link — nothing is stored on a server.
- **Three lenses on one engine** — **Patient** (deep optimizer), **Employer** (model an
  ICHRA contribution against real prices and your workforce), **Hospital** (see a
  procedure's cost across every plan; read a patient's card at the front desk).

## Real data sources

| Need | Source |
|---|---|
| Plans, premiums, deductibles, OOP max, cost-sharing | **CMS Health Insurance Exchange Public Use Files, PY2026** (data.healthcare.gov) |
| Care utilization & expenditure calibration | **AHRQ Medical Expenditure Panel Survey (MEPS)** |
| Premium subsidies | ACA **APTC** via the second-lowest-cost silver benchmark |
| Procedure prices | Typical allowed amounts aligned to CMS reference rates |

Bundled states: **TX, FL, NC, OH** (federal-exchange markets, ~1,600 real plans).

## Tech

Next.js 16 (App Router) · TypeScript · Tailwind v4 · hand-built SVG charts ·
Anthropic Claude (`claude-opus-4-8` for reasoning, `claude-haiku-4-5` for extraction) ·
Web Speech API for voice · deploys on Vercel.

The simulation/optimization engine is pure TypeScript in `lib/sim/` and unit-tested.

## Develop

```bash
npm install
cp .env.example .env.local      # add your ANTHROPIC_API_KEY for the assistant
npm run dev
```

The optimizer, charts, and Coverage Card work without a key — only the conversational
assistant and voice-to-profile need `ANTHROPIC_API_KEY`.

```bash
npm test          # engine unit tests (adjudication + ranking)
npm run build     # production build
npm run ingest    # re-build data/plans.*.json from the CMS PUFs (downloads ~700MB)
```

## How the data is built

`scripts/ingest_pufs.py` streams the real CMS PY2026 Plan Attributes, Rate, and
Benefits & Cost-Sharing PUFs, filters to the bundled states, parses the human-readable
cost-sharing strings (e.g. `"20% Coinsurance after deductible"`) into a typed schema,
and emits the compact `data/plans.<state>.json` the app ships. The raw downloads are
gitignored; only the normalized JSON is committed.

---

*Covera is decision support, not insurance advice. Estimates model your inputs against
real plan rules; confirm specifics with the issuer before enrolling.*

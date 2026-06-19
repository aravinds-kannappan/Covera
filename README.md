# Covera — the insurance marketplace that texts you the right plan

**Stuck with your employer's two options, or shopping on your own? Text Covera your
situation.** A team of AI agents searches the entire marketplace, simulates what you'd
truly pay, answers any what-if, and — once you choose — reaches out to your employer or
hospital for you.

Covera reframes health insurance as a **marketplace engine you talk to like a person**.
Under the hood it runs thousands of simulated years of your health against **every real
marketplace plan** in your state and ranks them by what you'd actually pay — premium plus
out-of-pocket — and the financial risk you'd carry.

Every figure traces to public data. No synthetic plans, prices, or claims.

## What it does

- **A texting concierge (multi-agent).** A warm, empathetic lead agent holds the
  conversation and coordinates specialists: an **intake** agent (free-text → structured
  profile), the **simulation advisor** (ranks real plans, runs what-ifs), a **marketplace
  comparator** (your employer offer vs. the open marketplace, net of subsidy), a **hospital
  cost** lookup, and an **outreach** agent that drafts — and optionally sends — messages to
  your employer's HR or a hospital after you finalize a plan. It absorbs the human details
  that don't fit a form (fears, constraints, preferences) and tailors its advice to them.
- **Stochastic cost engine.** A Monte-Carlo simulation grounds your likely care in real
  AHRQ MEPS utilization data, runs thousands of simulated years through each plan's actual
  cost-sharing rules, and ranks plans by **risk-adjusted** total cost. Shows best/worst
  case, the probability you hit your out-of-pocket max, the cost-vs-risk efficient frontier,
  and what drives your cost.
- **Conversational what-if navigator (in-app).** Describe your situation by voice or text
  and Claude builds your profile; ask anything; pose "what if I get pregnant / lose my
  job?" and Claude re-runs the real simulation and explains how the ranking changes.
- **Coverage Card.** A portable, patient-owned card (QR + link). A provider opens it to see
  coverage and a live point-of-care cost estimate **without touching your medical records**.
  The whole card lives in the link — nothing is stored on a server.
- **Three lenses on one engine** — **Patient** (deep optimizer), **Employer** (model an
  ICHRA contribution against real prices and your workforce), **Hospital** (a procedure's
  cost across every plan; read a patient's card at the front desk).
- **Benchmarks (`/benchmark`).** An honest accuracy scorecard for the simulation (vs. MEPS
  aggregates and the ACA subsidy formula) and an LLM model benchmark across candidate
  models. See *Benchmarks* below.

## The interactive landing page

The home page is a **scroll-driven narrative**: an iMessage-style phone stays pinned while a
conversation plays out and product features pop in alongside each message — intake → a
marketplace verdict → ranked plans → a pregnancy what-if → a delivery cost → an employer
outreach draft. Below it, a **live console** lets you talk to the real agent (no sign-up).
The scripted story is deterministic and needs no API key; the live console uses one.

## Graceful degradation

Every external dependency is optional — the app always demos. With **no keys at all**, the
optimizer, charts, Coverage Card, the scripted landing story, and the accuracy benchmark all
work. Each capability lights up as you add the matching key (see *Environment*).

| Capability | Needs |
|---|---|
| Optimizer, charts, Coverage Card, scripted landing story, accuracy report | nothing |
| Live agent (in-app assistant, voice→profile, live console) | `ANTHROPIC_API_KEY` |
| Conversation memory across texts | Upstash Redis (else in-memory fallback) |
| Real blue-bubble iMessage delivery | LoopMessage (else on-page sandbox) |
| Real outreach email send | Resend (else draft-only preview) |
| LLM model benchmark | `ANTHROPIC_API_KEY` |

## Real data sources

| Need | Source |
|---|---|
| Plans, premiums, deductibles, OOP max, cost-sharing | **CMS Health Insurance Exchange Public Use Files, PY2026** (data.healthcare.gov) |
| Care utilization & expenditure calibration | **AHRQ Medical Expenditure Panel Survey (MEPS)** |
| Premium subsidies | ACA **APTC** via the second-lowest-cost silver benchmark |
| Procedure prices | Typical allowed amounts aligned to CMS reference rates |

Bundled states: **TX, FL, NC, OH** (federal-exchange markets, ~1,600 real plans).

## Tech

Next.js 16 (App Router) · TypeScript · Tailwind v4 · `motion` for scroll/entry animation ·
hand-built SVG charts · Anthropic Claude (`claude-opus-4-8` for the concierge/advisor,
`claude-haiku-4-5` for intake/extraction) · Upstash Redis (REST) for conversation memory ·
LoopMessage for iMessage · Resend for outreach · Web Speech API for voice · deploys on Vercel.

The simulation/optimization engine is pure TypeScript in `lib/sim/` and unit-tested.

## Architecture

```
lib/agents/      orchestrator (lead) + intake, advisor, marketplace, hospital, outreach, prompts, registry
lib/channel/     provider-agnostic MessageChannel: sandbox (default) + loopmessage (real iMessage)
lib/store/       Upstash Redis REST client + conversation store (in-memory fallback)
lib/outreach/    Resend email (optional)
lib/sim/         Monte-Carlo engine: utilization, cost-sharing, subsidy, optimize
lib/benchmark/   shared report types + loaders
components/text/  shared iMessage UI: phone frame, bubbles, feature panels, scroll story, live console
app/api/sms/     enroll · webhook (provider inbound) · send (live console)
scripts/accuracy, scripts/benchmark   report generators → data/*.json → /benchmark
```

## Develop

```bash
npm install
cp .env.example .env.local      # add keys for the features you want (all optional)
npm run dev
```

```bash
npm test          # engine + agent unit tests (adjudication, ranking, channel, store, orchestrator)
npm run typecheck # tsc --noEmit
npm run build     # production build
npm run accuracy  # generate data/accuracy-report.json (no key needed)
npm run benchmark # generate data/llm-benchmark.json (needs ANTHROPIC_API_KEY)
npm run ingest    # re-build data/plans.*.json from the CMS PUFs (downloads ~700MB)
```

## Benchmarks

`/benchmark` answers "how accurate is this, really?" with two honest scorecards:

- **Simulation accuracy** (`scripts/accuracy`) — validates the engine against the published
  MEPS aggregates it claims to reproduce (mean spend by age band, spend concentration) and
  the ACA subsidy formula. It reports both where the engine is accurate (adult age-band
  means, subsidy math) and where it diverges (it compresses the heavy right tail of real
  spending) — committed to `data/accuracy-report.json`.
- **LLM model benchmark** (`scripts/benchmark`) — runs a fixed suite of patient questions
  through candidate models (`claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5`)
  driving the real agent tools, scoring **faithfulness** (cites real simulated numbers vs.
  hallucinates), **tool-use accuracy**, **quality** (LLM-as-judge), **latency**, and **real
  cost** (token usage × published per-model pricing). Writes `data/llm-benchmark.json`.

## Texting setup (real iMessage)

Apple has no official iMessage API, so blue-bubble delivery uses a relay. Set
`CHANNEL_PROVIDER=loopmessage` and the `LOOPMESSAGE_*` keys to send real iMessage; point your
LoopMessage webhook at `/api/sms/webhook`. Without those, `CHANNEL_PROVIDER=sandbox` (the
default) routes the same multi-agent loop to the on-page live console — fully exercisable
locally and on Vercel with no third-party account.

## How the data is built

`scripts/ingest_pufs.py` streams the real CMS PY2026 Plan Attributes, Rate, and Benefits &
Cost-Sharing PUFs, filters to the bundled states, parses the human-readable cost-sharing
strings (e.g. `"20% Coinsurance after deductible"`) into a typed schema, and emits the
compact `data/plans.<state>.json` the app ships. The raw downloads are gitignored; only the
normalized JSON is committed.

---

*Covera is decision support, not insurance advice. Estimates model your inputs against real
plan rules; confirm specifics with the issuer before enrolling.*

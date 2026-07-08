# Covera

Covera is a health plan marketplace you can just talk to. Tell it your situation by voice or by
text. A team of agents searches the whole marketplace, simulates what you would really pay, and
helps you choose. Then it stays with you all year.

Every figure traces to public federal data. There are no synthetic plans, prices, or claims.

## What it does

- Talk or text. A voice concierge (or the text console) asks about your life and your budget.
- Real cost, not just premium. It runs thousands of simulated years per plan and ranks on
  risk-adjusted all-in cost instead of the cheapest sticker price.
- Fits your drugs and doctors. A plan that would drop one of your medications gets flagged and
  penalized, so "cheapest" never quietly means "does not cover your drug."
- Year-round advocate. Estimate a procedure before you book it. Audit a bill. Draft an appeal.
  Re-check your plan at open enrollment.
- Three desks that talk to each other. The patient, employer, and hospital each get an agent. The
  hospital and employer agents consult your concierge through a Coverage Card to get real coverage
  and cost, without ever pulling a record.
- Coverage Card. A portable link that shows your coverage and a live estimate. The whole card
  lives in the link.
- Benchmarks at `/benchmark`. Simulation accuracy, an AI safety and alignment scorecard, and a
  live Agents-as-Judge evaluation you run from the tab.

## The core idea

A premium is one number. Your real cost is a distribution, and the two rarely agree. Healthcare
spending is very skewed: the top 5% of people drive about half of all spending. So the average
hides the bad year that actually bankrupts people.

Covera ranks plans on expected cost plus a downside-risk penalty (the p90 cost and the odds of
hitting your out-of-pocket max). That is why the cheapest plan is often not the right one. Each
simulated year samples your likely care from real AHRQ MEPS data, then runs it through the plan's
real deductible, coinsurance, and out-of-pocket rules. One year is a guess. Thousands reveal the
shape.

## Voice and the agent mesh

The patient tab has a voice mode. Tap the mic and talk. Speech-to-text (ElevenLabs) transcribes
you, a cheap Baseten model runs the same real tools, and the reply is spoken back. Once it has
enough it pops up your ranked plans to choose from. With no keys it falls back to the browser's
speech and Claude, and you can always type.

The hospital and employer tabs have their own voice desks. A physician or an HR contact talks to
the desk, and the desk consults the patient's concierge. The Coverage Card is the handshake: the
concierge answers with real coverage and a real estimate and never exposes a record.

Rankings and costs always come from the deterministic simulation. The models only phrase and
route. Nothing bills on page load. A paid call fires only on an explicit action, and an optional
spend cap (`ORTH_MAX_SPEND_USD`) bounds it.

## Safety by construction

The recommendation is not a bare `argmin`. It runs through a deterministic actor, critic, and
memory layer (`lib/agents/selection`). The critic is a hard backstop. It will not let a plan be the
headline if it drops a required drug or doctor, fails an HSA requirement, prices the patient out, or
leaves a risk-averse person a brutal bad year. The `/benchmark` page ships a safety scorecard that
measures this over a synthetic population and an adversarial red-team, with no model in the loop.

## Run it locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Nothing is required to run. The optimizer, charts, Coverage Card, and the accuracy and safety
reports all work with no keys. Each key below unlocks more, and the app degrades gracefully without
it.

- `ANTHROPIC_API_KEY`: the live text agent and the model benchmark. Recommended.
- `ORTHOGONAL_API_KEY`: one key for voice (ElevenLabs), the cheap Baseten brain, live web search
  (Tavily), link document extraction (ScrapeGraphAI), email verification (Didit), and real SMS
  (AgentPhone). Everything stays dormant without it.
- `UPSTASH_REDIS_REST_URL` and `_TOKEN`: conversation memory across sessions. Falls back to
  in-process memory.
- `RESEND_API_KEY` and `OUTREACH_FROM_EMAIL`: actually send outreach. Otherwise it drafts only.
- `LOOPMESSAGE_*` with `CHANNEL_PROVIDER=loopmessage`: real blue-bubble iMessage. Otherwise the
  on-page console.

See `.env.example` for the full list and the per-capability costs. Models run through a provider
router (`lib/llm`): a cheap Baseten model for the voice concierge, Claude Sonnet 5 for advising,
and Haiku for quick extraction. There is no Opus or Fable.

## Scripts

```bash
npm test          # unit tests
npm run typecheck
npm run build
npm run accuracy   # data/accuracy-report.json   (no key)
npm run safety     # data/safety-report.json      (no key)
npm run benchmark  # data/llm-benchmark.json       (needs a model key)
npm run ingest     # rebuild plan data from the CMS PUFs
```

## Real data

- Plans, premiums, deductibles, cost-sharing: CMS Health Insurance Exchange Public Use Files,
  PY2026.
- Care utilization: AHRQ Medical Expenditure Panel Survey (MEPS).
- Subsidies: the ACA APTC via the second-lowest-cost silver benchmark.
- Procedure prices: CMS Medicare Physician data, via `npm run ingest:prices`.
- Drug formularies: CMS QHP machine-readable files, via `npm run ingest:formulary`.

Bundled: all 30 federal-exchange states in the PY2026 PUF (about 3,900 real plans). State-based
exchanges like CA and NY are not in this federal file, so they are out of scope. Adding a state is
an ingest and a rebuild, with no code change.

## Tech

Next.js 16, TypeScript, Tailwind v4, `motion`, hand-built SVG charts, a provider-agnostic model
router (Baseten and Claude), ElevenLabs voice, Upstash Redis, Resend, and Vercel. The engine is
pure TypeScript in `lib/sim` and is unit-tested.

---

Covera is decision support, not insurance advice. Confirm specifics with the issuer before
enrolling.

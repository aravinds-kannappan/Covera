import type { ConvoMessage } from "@/lib/agents/types";

// A hand-authored, deterministic conversation that powers the scroll-driven landing
// narrative. It needs no API key, so the marketing story is always fast and reliable.
// The figures are illustrative but shaped like real Covera output; the live console
// below the story produces the genuine numbers.

export interface ScriptStep {
  message: ConvoMessage;
  /** Narrative caption shown beside the phone while this step is the latest. */
  caption?: { eyebrow: string; title: string; body: string };
}

const t = (i: number) => 1_700_000_000_000 + i * 60_000;

export const DEMO_SCRIPT: ScriptStep[] = [
  {
    message: {
      role: "agent",
      ts: t(0),
      text: "Hi, I'm Covera 👋 Tell me a bit about you and I'll find the right health plan from the whole marketplace — not just what an employer hands you.",
    },
    caption: {
      eyebrow: "It starts with a text",
      title: "No forms. No portals.",
      body: "Covera is a marketplace engine you talk to like a person. Give it your situation in plain language and it does the shopping.",
    },
  },
  {
    message: {
      role: "patient",
      ts: t(1),
      text: "I'm 34, in Texas, make about $48k. Type 2 diabetes, I take metformin daily.",
    },
  },
  {
    message: {
      role: "agent",
      ts: t(2),
      text: "Got it. A quick read of your situation — anything I'm missing, just tell me.",
      meta: {
        kind: "profile",
        data: {
          filled: ["age 34", "Texas", "$48,000 income", "Type 2 diabetes", "1 medication"],
          missing: ["planned procedures", "risk preference"],
        },
      },
    },
    caption: {
      eyebrow: "Act 1 — Tell it about you",
      title: "It listens and builds your profile",
      body: "An intake agent turns your words into a structured health + financial picture. The reasoning model never guesses your facts.",
    },
  },
  {
    message: {
      role: "patient",
      ts: t(3),
      text: "My job offers a plan but it's $420/mo for me. Is that actually a good deal?",
    },
  },
  {
    message: {
      role: "agent",
      ts: t(4),
      text: "Not for you. With your income you qualify for a subsidy on the marketplace, and your employer plan doesn't. The best comparable marketplace plan is far cheaper.",
      meta: {
        kind: "marketplace",
        data: {
          state: "TX",
          planCount: 800,
          issuers: 15,
          employerOfferMonthly: 420,
          bestMarketplaceMonthly: 246,
          verdict: "The marketplace wins — about $174/mo cheaper than your employer's offer.",
        },
      },
    },
    caption: {
      eyebrow: "Act 2 — The whole marketplace",
      title: "Not just your employer's two options",
      body: "Covera compares your employer offer against every on-exchange plan in your state, net of the subsidy you actually qualify for.",
    },
  },
  {
    message: { role: "patient", ts: t(5), text: "Whoa. Okay, show me the best plans then." },
  },
  {
    message: {
      role: "agent",
      ts: t(6),
      text: "Here are your top three by risk-adjusted all-in cost — premium plus what the simulation expects you'll actually pay.",
      meta: {
        kind: "plans",
        data: {
          label: "Your ranked plans",
          subsidyMonthly: 312,
          topPlans: [
            { name: "Blue Advantage Silver HMO", metal: "Silver", expectedTotal: 5120, p90: 8400, annualPremium: 2952, probHitOOPMax: 18 },
            { name: "Ambetter Balanced Care 12", metal: "Silver", expectedTotal: 5380, p90: 7900, annualPremium: 2640, probHitOOPMax: 14 },
            { name: "Oscar Gold Classic", metal: "Gold", expectedTotal: 5610, p90: 7100, annualPremium: 3720, probHitOOPMax: 9 },
          ],
        },
      },
    },
    caption: {
      eyebrow: "Act 3 — Real simulation",
      title: "Ranked on what you'll really pay",
      body: "A Monte-Carlo engine runs thousands of simulated years of your care through each plan's real cost-sharing rules — then ranks by total risk-adjusted cost.",
    },
  },
  {
    message: { role: "patient", ts: t(7), text: "What if I get pregnant next year?" },
  },
  {
    message: {
      role: "agent",
      ts: t(8),
      text: "Then the math flips toward the Gold plan — its lower out-of-pocket max protects you in a delivery year, even though the premium is higher.",
      meta: {
        kind: "whatif",
        data: {
          label: "If you get pregnant",
          subsidyMonthly: 312,
          topPlans: [
            { name: "Oscar Gold Classic", metal: "Gold", expectedTotal: 8740, p90: 9100, annualPremium: 3720, probHitOOPMax: 61 },
            { name: "Blue Advantage Silver HMO", metal: "Silver", expectedTotal: 9320, p90: 12300, annualPremium: 2952, probHitOOPMax: 74 },
            { name: "Ambetter Balanced Care 12", metal: "Silver", expectedTotal: 9510, p90: 12800, annualPremium: 2640, probHitOOPMax: 78 },
          ],
        },
      },
    },
    caption: {
      eyebrow: "Ask any what-if",
      title: "Re-runs the real numbers, by text",
      body: "Every \"what if\" — a new condition, a baby, a raise, losing a job — re-runs the simulation and shows how your best plan changes.",
    },
  },
  {
    message: { role: "patient", ts: t(9), text: "How much would the delivery itself cost me?" },
  },
  {
    message: {
      role: "agent",
      ts: t(10),
      text: "On the Gold plan you'd hit your out-of-pocket max, so your share of a delivery lands near the low end. Here's the range across plans in Texas.",
      meta: {
        kind: "hospital",
        data: { procedure: "Childbirth (vaginal delivery)", state: "TX", min: 1200, median: 4800, max: 9100 },
      },
    },
  },
  {
    message: { role: "patient", ts: t(11), text: "Perfect. Let's go with the Gold plan." },
  },
  {
    message: {
      role: "agent",
      ts: t(12),
      text: "Locked in. Want me to message your employer's HR to see if they'll reimburse it through an ICHRA? I drafted this — say the word and I'll send it.",
      meta: {
        kind: "outreach",
        data: {
          target: "employer",
          to: null,
          sent: false,
          subject: "Question about individual marketplace coverage",
          body: "Hello,\n\nI've selected an individual marketplace plan that fits my care needs better than our group offer. Could we discuss whether the company supports reimbursing an individual plan (for example via an ICHRA)? I'd appreciate your guidance on next steps.\n\nThank you,\nSent via Covera on behalf of the member.",
        },
      },
    },
    caption: {
      eyebrow: "Act 4 — It acts for you",
      title: "Reaches your employer & hospital",
      body: "Once you choose, Covera drafts outreach to your employer or hospital — and sends it on your behalf when you approve.",
    },
  },
];

export const DEMO_MESSAGES: ConvoMessage[] = DEMO_SCRIPT.map((s) => s.message);

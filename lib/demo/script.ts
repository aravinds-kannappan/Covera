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
      text: "I'm 34, in Texas, make about $48k. Type 2 diabetes, metformin daily. Honestly I'm scared of getting a bill I can't pay.",
    },
  },
  {
    message: {
      role: "agent",
      ts: t(2),
      text: "That fear is so common, and it's exactly what I'm here to protect you from — let's make a bad year survivable, not scary. Here's what I've got so far; tell me if I'm off.",
      meta: {
        kind: "profile",
        data: {
          filled: ["age 34", "Texas", "$48,000 income", "Type 2 diabetes", "1 medication"],
          missing: ["worried about a surprise bill", "planned procedures"],
        },
      },
    },
    caption: {
      eyebrow: "Act 1 — It actually listens",
      title: "It hears you, not just your data",
      body: "Covera picks up the human stuff — your fears, your constraints, your life — and carries it through every recommendation. It's a companion, not a form.",
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
      text: "Given that fear of a bad year, I'd lean you toward the Silver HMO — it keeps your typical year low but still caps the damage if things go sideways. Here are your top three so you can see the tradeoff.",
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
  {
    message: { role: "patient", ts: t(13), text: "That's the thing though — what happens after I enroll? Last year I got blindsided by bills." },
  },
  {
    message: {
      role: "agent",
      ts: t(14),
      text: "I don't disappear once you pick. Forward me any bill and I'll check each line against what providers actually charge. Here's one a member sent me.",
      meta: {
        kind: "billaudit",
        data: {
          totalBilled: 2330,
          potentialOvercharge: 1499,
          flaggedLines: [
            { description: "ER visit, level 4 (99284)", billed: 1850, referenceAllowed: 415, flags: ["overcharge"] },
            { description: "Metabolic panel (80053)", billed: 240, referenceAllowed: 61, flags: ["overcharge"] },
            { description: "Metabolic panel (80053)", billed: 240, referenceAllowed: 61, flags: ["possible duplicate"] },
          ],
          summary: ["2 lines billed well above typical charges", "1 line looks duplicated"],
        },
      },
    },
    caption: {
      eyebrow: "Act 5 — It stays all year",
      title: "Catches a bad bill",
      body: "Up to 80% of medical bills contain errors. Covera benchmarks each line against real CMS submitted charges and flags overcharges and duplicates worth questioning.",
    },
  },
  {
    message: { role: "patient", ts: t(15), text: "And my knee MRI got denied — they said 'not medically necessary.'" },
  },
  {
    message: {
      role: "agent",
      ts: t(16),
      text: "That's appealable, and most people never try. I drafted an appeal from your plan and situation — review it and it's ready to send.",
      meta: {
        kind: "appeal",
        data: {
          service: "MRI of the right knee",
          denialReason: "Not medically necessary",
          subject: "Appeal of denied claim — MRI of the right knee",
          letter:
            "To the appeals department,\n\nI am formally appealing the denial of my claim for an MRI of the right knee, denied as \"not medically necessary.\" The imaging was ordered after persistent pain and an inconclusive exam, and is a covered benefit under my plan. I request a full review and a written determination with my further appeal rights.\n\nThank you,\n[Member name] · [Member ID] · [Claim number]\nSent via Covera on behalf of the member.",
          sent: false,
        },
      },
    },
    caption: {
      eyebrow: "Defend",
      title: "Fights a denial in minutes",
      body: "Insurers deny about 19% of in-network claims and fewer than 1% are ever appealed. Covera drafts the appeal from your own policy so you actually push back.",
    },
  },
  {
    message: { role: "patient", ts: t(17), text: "It's open enrollment again. Am I still on the best plan? My meds changed." },
  },
  {
    message: {
      role: "agent",
      ts: t(18),
      text: "Re-ran everything with your new prescription. You've drifted off your best fit — switching saves you real money this year.",
      meta: {
        kind: "recheck",
        data: {
          currentPlanName: "Oscar Gold Classic",
          currentExpectedTotal: 6180,
          bestPlanName: "Blue Advantage Silver HMO",
          bestExpectedTotal: 5240,
          annualSavings: 940,
          shouldSwitch: true,
          reason: "Your new medication shifts the math — a Silver plan now covers it for less all-in.",
        },
      },
    },
    caption: {
      eyebrow: "Act 6 — Every open enrollment",
      title: "Re-checks so you don't overpay",
      body: "Most people never switch, overpaying out of pure inertia. Covera re-ranks every year as your health, meds, and income change — and nudges you only when it's worth it.",
    },
  },
];

export const DEMO_MESSAGES: ConvoMessage[] = DEMO_SCRIPT.map((s) => s.message);

"use client";
import { motion } from "motion/react";
import { Globe, ReceiptText, Send, Stethoscope } from "lucide-react";
import { PhoneFrame } from "@/components/text/phone-frame";
import { cn } from "@/lib/utils";

// A parsel-style band of alternating feature rows. Each capability is shown as a tiny iMessage
// exchange inside a phone, so the "everything happens by text" metaphor carries through the
// whole page. Rows animate in as they scroll into view. All content is illustrative, matching
// the shape of real Covera output.

type Bubble = { agent?: boolean; text: string };
type Result = { tone: "emerald" | "sky" | "violet" | "amber"; label: string; value: string; sub?: string };

interface Capability {
  icon: typeof Stethoscope;
  tone: "emerald" | "sky" | "violet" | "amber";
  eyebrow: string;
  title: string;
  body: string;
  contact: string;
  bubbles: Bubble[];
  result?: Result;
}

const CAPABILITIES: Capability[] = [
  {
    icon: Stethoscope,
    tone: "emerald",
    eyebrow: "Before any procedure",
    title: "Know the cost before you go",
    body: "Ask what a procedure will cost you on your own plan, before and after your deductible. No more walking in blind.",
    contact: "Covera",
    bubbles: [
      { text: "What will an MRI of my knee cost me?" },
      { agent: true, text: "On your plan, about $312 now (deductible not met), or $95 once it is. Here's the breakdown." },
    ],
    result: { tone: "emerald", label: "Your share, MRI knee", value: "$95 – $312", sub: "in-network, this plan" },
  },
  {
    icon: ReceiptText,
    tone: "amber",
    eyebrow: "When a bill looks wrong",
    title: "Catch overcharges automatically",
    body: "Forward a confusing medical bill and Covera benchmarks each line against typical allowed amounts, flagging what to question.",
    contact: "Covera",
    bubbles: [
      { text: "Got a $2,400 ER bill. Is this right?" },
      { agent: true, text: "Two lines look high and one looks duplicated. You could push back on about $760." },
    ],
    result: { tone: "amber", label: "Potential overcharge", value: "$760", sub: "3 lines flagged to dispute" },
  },
  {
    icon: Globe,
    tone: "sky",
    eyebrow: "Live coverage answers",
    title: "Answers beyond the plan documents",
    body: "For current formulary or policy questions your plan file can't answer, Covera runs a live web lookup and cites the source.",
    contact: "Covera",
    bubbles: [
      { text: "Does Cigna cover Ozempic in Texas?" },
      { agent: true, text: "Yes, with prior authorization (from a live web search). I'd confirm your exact tier with the issuer." },
    ],
    result: { tone: "sky", label: "Live web answer", value: "Covered · prior auth", sub: "sourced, not guessed" },
  },
  {
    icon: Send,
    tone: "violet",
    eyebrow: "It acts for you",
    title: "Reaches out on your behalf",
    body: "Once you choose, Covera can text or email your employer's HR or a hospital, after a quick identity check, so you don't have to.",
    contact: "Covera",
    bubbles: [
      { text: "Can you ask my HR about ICHRA reimbursement?" },
      { agent: true, text: "Drafted and ready. Verify your email and I'll send it on your behalf." },
    ],
    result: { tone: "violet", label: "Outreach", value: "Draft ready to send", sub: "sent only after you verify" },
  },
];

const toneText: Record<Capability["tone"], string> = {
  emerald: "bg-indigo-50 text-indigo-600",
  sky: "bg-indigo-50 text-indigo-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
};
const chipTone: Record<Result["tone"], string> = {
  emerald: "border-indigo-200 bg-indigo-50",
  sky: "border-indigo-200 bg-indigo-50",
  violet: "border-violet-200 bg-violet-50",
  amber: "border-amber-200 bg-amber-50",
};

function MiniBubble({ agent, text }: Bubble) {
  return (
    <div className={cn("flex", agent ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[86%] rounded-2xl px-3 py-1.5 text-[12.5px] leading-snug shadow-sm",
          agent
            ? "rounded-bl-md bg-gradient-to-br from-indigo-500 to-indigo-600 text-white"
            : "rounded-br-md bg-slate-100 text-slate-800",
        )}
      >
        {text}
      </div>
    </div>
  );
}

function CapabilityRow({ cap, index }: { cap: Capability; index: number }) {
  const flipped = index % 2 === 1;
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16"
    >
      <div className={cn(flipped && "lg:order-2")}>
        <span className={cn("grid h-11 w-11 place-items-center rounded-xl", toneText[cap.tone])}>
          <cap.icon className="h-6 w-6" />
        </span>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{cap.eyebrow}</p>
        <h3 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{cap.title}</h3>
        <p className="mt-3 max-w-md text-slate-600">{cap.body}</p>
      </div>

      <div className={cn(flipped && "lg:order-1")}>
        <PhoneFrame className="max-w-[320px]" contactName={cap.contact}>
          <div className="space-y-2.5 bg-slate-50/60 px-3 py-4">
            {cap.bubbles.map((b, i) => (
              <MiniBubble key={i} {...b} />
            ))}
            {cap.result && (
              <div className={cn("mt-2 rounded-xl border px-3 py-2.5", chipTone[cap.result.tone])}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{cap.result.label}</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">{cap.result.value}</p>
                {cap.result.sub && <p className="text-[11px] text-slate-500">{cap.result.sub}</p>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-slate-100 bg-white p-2.5">
            <div className="h-7 flex-1 rounded-full bg-slate-100" />
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600" />
          </div>
        </PhoneFrame>
      </div>
    </motion.div>
  );
}

export function CapabilityShowcase() {
  return (
    <div className="space-y-16 lg:space-y-24">
      {CAPABILITIES.map((cap, i) => (
        <CapabilityRow key={cap.title} cap={cap} index={i} />
      ))}
    </div>
  );
}

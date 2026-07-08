import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "emerald" | "amber" | "rose" | "sky" | "violet";

// Tone keys are kept stable so callers never change; "emerald" and "sky" now read as the single
// indigo accent. Rendered as an uppercase, letter-spaced monospace label (the Parsel eyebrow look).
const tones: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
  emerald: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  sky: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "label-mono inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

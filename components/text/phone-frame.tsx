import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * An iMessage-style device shell. Children render inside the "screen". Used to wrap the
 * scripted landing narrative and the live console so the texting metaphor is consistent.
 */
export function PhoneFrame({
  className,
  contactName = "Covera",
  children,
}: {
  className?: string;
  contactName?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-[360px] rounded-[2.6rem] border border-slate-200 bg-slate-900 p-2 shadow-2xl shadow-slate-900/20",
        className,
      )}
    >
      <div className="overflow-hidden rounded-[2.1rem] bg-white">
        {/* status / contact bar */}
        <div className="flex flex-col items-center gap-1 border-b border-slate-100 bg-white/90 px-4 pb-2 pt-3 backdrop-blur">
          <span className="h-1.5 w-20 rounded-full bg-slate-200" aria-hidden />
          <div className="mt-1 flex flex-col items-center">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-semibold text-white">
              Co
            </span>
            <span className="mt-1 text-[13px] font-semibold text-slate-900">{contactName}</span>
            <span className="text-[11px] text-slate-400">iMessage</span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

"use client";
import { useState } from "react";

// Hero phone-number capture. On submit it enrolls the number and (when a real iMessage
// relay is configured) fires the first welcome text. In sandbox mode it confirms the
// opt-in and points the visitor to the live console below.
export function EnrollForm() {
  const [phone, setPhone] = useState("");
  const [optIn, setOptIn] = useState(true);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [detail, setDetail] = useState<{ channel?: string; delivered?: boolean; message?: string }>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setState("loading");
    try {
      const res = await fetch("/api/sms/enroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, optIn }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDetail({ message: data.error ?? "Could not enroll that number." });
        setState("error");
      } else {
        setDetail({ channel: data.channel, delivered: data.delivered });
        setState("done");
      }
    } catch {
      setDetail({ message: "Network error: try again." });
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-medium text-emerald-800">
          {detail.delivered
            ? "Sent! Check Messages: Covera just texted you. 📱"
            : "You're on the list. Real texting turns on when an iMessage relay is connected: meanwhile, try the live agent just below. 👇"}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        Get the agent on iMessage
      </label>
      <div className="mt-2 flex gap-2">
        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
          className="h-11 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none focus:border-emerald-400"
        />
        <button
          type="submit"
          disabled={state === "loading" || !phone.trim()}
          className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          {state === "loading" ? "Texting…" : "Text me"}
        </button>
      </div>
      <label className="mt-3 flex items-start gap-2 text-xs text-slate-500">
        <input
          type="checkbox"
          checked={optIn}
          onChange={(e) => setOptIn(e.target.checked)}
          className="mt-0.5 accent-emerald-600"
        />
        <span>I agree to receive texts from Covera. iPhone/iMessage users for now. Decision support, not insurance advice.</span>
      </label>
      {state === "error" && <p className="mt-2 text-xs text-rose-600">{detail.message}</p>}
    </form>
  );
}

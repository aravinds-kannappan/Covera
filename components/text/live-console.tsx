"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import type { ConvoMessage } from "@/lib/agents/types";
import { PhoneFrame } from "@/components/text/phone-frame";
import { MessageBubble, TypingBubble } from "@/components/text/message-bubble";

const SUGGESTIONS = [
  "I'm 29 in Florida, $35k, healthy",
  "What if I have a baby next year?",
  "My job's plan is $380/mo — worth it?",
  "How much is an MRI?",
];

const GREETING: ConvoMessage = {
  role: "agent",
  ts: Date.now(),
  text: "I'm the real Covera agent — same one that texts you. Tell me your age, state, income, and any conditions, and I'll find your plan. Try a prompt below.",
};

/** The interactive "try it" console. Drives the genuine multi-agent loop via /api/sms/send. */
export function LiveConsole() {
  const [messages, setMessages] = useState<ConvoMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionId = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Generate the session id on the client only (kept out of render to stay pure).
    if (!sessionId.current) sessionId.current = Math.random().toString(36).slice(2);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    if (!sessionId.current) sessionId.current = Math.random().toString(36).slice(2);
    setError(null);
    setInput("");
    setMessages((m) => [...m, { role: "patient", text: trimmed, ts: Date.now() }]);
    setBusy(true);
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId.current, text: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "The live agent is unavailable right now.");
      } else {
        setMessages((m) => [...m, ...(data.replies as ConvoMessage[])]);
      }
    } catch {
      setError("Network hiccup — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,360px)_1fr]">
      <PhoneFrame>
        <div ref={scrollRef} className="scroll-thin h-[460px] space-y-3 overflow-y-auto bg-slate-50/60 px-3 py-4">
          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} />
          ))}
          <AnimatePresence>{busy && <TypingBubble />}</AnimatePresence>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 border-t border-slate-100 bg-white p-2.5"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Text Covera…"
            className="h-9 flex-1 rounded-full border border-slate-200 bg-slate-50 px-3.5 text-[13px] outline-none focus:border-emerald-400"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white disabled:opacity-40"
            aria-label="Send"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </PhoneFrame>

      <div>
        <h3 className="text-2xl font-semibold tracking-tight text-slate-900">Try the real agent</h3>
        <p className="mt-2 max-w-md text-slate-600">
          This is the genuine multi-agent system — the same one that texts patients. It reads your
          profile, runs the real CMS-data simulation, and answers any what-if. No sign-up.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              disabled={busy}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <p className="mt-4 text-xs text-slate-400">
          Want it on your phone for real? Add your number in the hero — Covera texts iMessage users
          (blue bubbles) when a relay is configured.
        </p>
      </div>
    </div>
  );
}

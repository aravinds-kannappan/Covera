"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { DEMO_SCRIPT, type ScriptStep } from "@/lib/demo/script";
import { PhoneFrame } from "@/components/text/phone-frame";
import { MessageBubble, TypingBubble } from "@/components/text/message-bubble";

// A hands-free version of the scripted conversation: press play (or just scroll it into view)
// and Covera "types" the whole exchange to you, feature panels and all. It reuses the same
// deterministic DEMO_SCRIPT as the scroll story, so it needs no API key and always looks right.
// This is what the "Watch the demo" button jumps to.

const AGENT_TYPING_MS = 950; // how long the typing dots show before an agent message lands
const AGENT_HOLD_MS = 1150; // pause after an agent message so its panel can be read
const PATIENT_MS = 850; // pause before a patient reply appears

export function AutoplayDemo({ steps = DEMO_SCRIPT }: { steps?: ScriptStep[] }) {
  const [shown, setShown] = useState(0); // number of messages revealed
  const [typing, setTyping] = useState(false);
  const [playing, setPlaying] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const done = shown >= steps.length;

  // Auto-start once when the demo first scrolls into view.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !startedRef.current) {
            startedRef.current = true;
            setPlaying(true);
          }
        }
      },
      { threshold: 0.35 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // The playback clock: reveal the next message. Agent turns show a typing indicator first;
  // patient replies pause a little longer after a rich panel so it can be read. Driven only by
  // `shown`, so there is no re-trigger loop from toggling `typing`.
  useEffect(() => {
    if (!playing || done) return;
    const next = steps[shown];

    if (next.message.role === "agent") {
      setTyping(true);
      const t = setTimeout(() => {
        setTyping(false);
        setShown((n) => n + 1);
      }, AGENT_TYPING_MS);
      return () => clearTimeout(t);
    }

    setTyping(false);
    const prev = steps[shown - 1];
    const extra = prev?.message.role === "agent" && prev.message.meta ? AGENT_HOLD_MS : 0;
    const wait = (shown === 0 ? 400 : PATIENT_MS) + extra;
    const t = setTimeout(() => setShown((n) => n + 1), wait);
    return () => clearTimeout(t);
  }, [playing, shown, done, steps]);

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [shown, typing]);

  const restart = useCallback(() => {
    setShown(0);
    setTyping(false);
    setPlaying(true);
  }, []);

  const toggle = useCallback(() => {
    if (done) return restart();
    setPlaying((p) => !p);
  }, [done, restart]);

  // Latest caption at or before the newest revealed step.
  let caption: ScriptStep["caption"];
  for (let i = shown - 1; i >= 0; i--) {
    if (steps[i]?.caption) {
      caption = steps[i].caption;
      break;
    }
  }

  const visible = steps.slice(0, shown).map((s) => s.message);
  const pct = Math.round((shown / steps.length) * 100);

  return (
    <div ref={sectionRef} className="grid items-center gap-10 lg:grid-cols-2">
      {/* Narrative side */}
      <div className="order-2 lg:order-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={caption?.title ?? "intro"}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.4 }}
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
              {caption?.eyebrow ?? "Live demo"}
            </span>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              {caption?.title ?? "Watch a real conversation play out."}
            </h3>
            <p className="mt-3 max-w-md text-lg text-slate-600">
              {caption?.body ??
                "No scrolling required: press play and Covera walks you through shopping, simulating, and choosing a plan, all by text."}
            </p>
          </motion.div>
        </AnimatePresence>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={toggle}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-500"
          >
            {done ? (
              <>
                <RotateCcw className="h-4 w-4" /> Replay
              </>
            ) : playing ? (
              <>
                <Pause className="h-4 w-4" /> Pause
              </>
            ) : (
              <>
                <Play className="h-4 w-4" /> Play the demo
              </>
            )}
          </button>
          {!done && shown > 0 && (
            <button
              type="button"
              onClick={restart}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" /> Restart
            </button>
          )}
        </div>

        <div className="mt-5 h-1 w-full max-w-xs overflow-hidden rounded-full bg-slate-200">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      </div>

      {/* Phone side */}
      <div className="order-1 lg:order-2">
        <PhoneFrame>
          <div
            ref={threadRef}
            className="scroll-thin h-[480px] space-y-3 overflow-y-auto bg-slate-50/60 px-3 py-4"
          >
            {visible.map((m, i) => (
              <MessageBubble key={i} message={m} />
            ))}
            {typing && <TypingBubble />}
            {shown === 0 && !typing && (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
                Press play to watch Covera find the right plan by text.
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-slate-100 bg-white p-2.5">
            <div className="h-8 flex-1 rounded-full bg-slate-100" />
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? "Pause demo" : "Play demo"}
              className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white"
            >
              {playing && !done ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
          </div>
        </PhoneFrame>
      </div>
    </div>
  );
}

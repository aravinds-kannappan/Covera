"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Mic, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import type { ConvoMessage } from "@/lib/agents/types";
import { DEMO_SCRIPT, type ScriptStep } from "@/lib/demo/script";
import { PhoneFrame } from "@/components/text/phone-frame";
import { MessageBubble, TypingBubble } from "@/components/text/message-bubble";
import { cn } from "@/lib/utils";

// The 60-second demo, on both channels at once: the iMessage thread plays on the phone while a
// voice panel shows the SAME conversation as speech, with an animated waveform and a live
// hand-off between the specialist agents (Intake -> Marketplace -> Advisor -> Cost desk ->
// Advocate). It reuses the deterministic DEMO_SCRIPT, so it needs no API key and never bills:
// the optional "hear it" toggle uses the browser's own speech, not the paid ElevenLabs voice
// (that lives on the patient tab). This is what the "Watch the demo" button jumps to.

const AGENT_TYPING_MS = 950;
const AGENT_HOLD_MS = 1150;
const PATIENT_MS = 850;

type AgentKey = "lead" | "intake" | "marketplace" | "advisor" | "costdesk" | "advocate";

const AGENTS: { key: AgentKey; label: string }[] = [
  { key: "lead", label: "Covera" },
  { key: "intake", label: "Intake" },
  { key: "marketplace", label: "Marketplace" },
  { key: "advisor", label: "Advisor" },
  { key: "costdesk", label: "Cost desk" },
  { key: "advocate", label: "Advocate" },
];

function agentForMessage(m: ConvoMessage): AgentKey {
  if (m.role === "patient") return "lead";
  switch (m.meta?.kind) {
    case "profile":
      return "intake";
    case "marketplace":
      return "marketplace";
    case "plans":
    case "whatif":
      return "advisor";
    case "hospital":
    case "estimate":
      return "costdesk";
    case "billaudit":
    case "appeal":
    case "recheck":
    case "outreach":
      return "advocate";
    default:
      return "lead";
  }
}

const WAVE = [0.4, 0.7, 1, 0.6, 0.85, 0.5, 0.75];

function speakBrowser(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.03;
  window.speechSynthesis.speak(u);
}

export function DualChannelDemo({ steps = DEMO_SCRIPT }: { steps?: ScriptStep[] }) {
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const done = shown >= steps.length;

  // Auto-start once when scrolled into view.
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

  // Playback clock: reveal the next message.
  useEffect(() => {
    if (!playing || done) return;
    const next = steps[shown];
    if (next.message.role === "agent") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional timed reveal state machine
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

  // Speak the newest agent line via the browser when voice is on (free, no paid call).
  useEffect(() => {
    if (!voiceOn || shown === 0) return;
    const m = steps[shown - 1]?.message;
    if (m?.role === "agent" && m.text) speakBrowser(m.text);
  }, [shown, voiceOn, steps]);

  // Stop any speech when paused, muted, or unmounted.
  useEffect(() => {
    if ((!playing || !voiceOn) && typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, [playing, voiceOn]);
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

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

  const visible = steps.slice(0, shown).map((s) => s.message);
  const latest = shown > 0 ? steps[shown - 1].message : undefined;
  const activeAgent: AgentKey = typing ? "lead" : latest ? agentForMessage(latest) : "lead";
  const speaking = playing && !typing && latest?.role === "agent";
  const patientSpeaking = playing && latest?.role === "patient";
  const pctDone = Math.round((shown / steps.length) * 100);

  // Latest caption at or before the newest revealed step.
  let caption: ScriptStep["caption"];
  for (let i = shown - 1; i >= 0; i--) {
    if (steps[i]?.caption) {
      caption = steps[i].caption;
      break;
    }
  }

  return (
    <div ref={sectionRef} className="grid items-center gap-8 lg:grid-cols-[minmax(0,360px)_1fr]">
      {/* Phone (text channel) */}
      <PhoneFrame>
        <div ref={threadRef} className="scroll-thin h-[480px] space-y-3 overflow-y-auto bg-slate-50/60 px-3 py-4">
          {visible.map((m, i) => (
            <MessageBubble key={i} message={m} />
          ))}
          {typing && <TypingBubble />}
          {shown === 0 && !typing && (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
              Press play to watch Covera find the right plan, by text and by voice.
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

      {/* Voice channel + narrative */}
      <div>
        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
          {caption?.eyebrow ?? "One conversation, two channels"}
        </span>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {caption?.title ?? "Text it, or just talk to it."}
        </h3>
        <p className="mt-3 max-w-md text-slate-600">
          {caption?.body ??
            "The same team of agents runs the real simulation whether you type or speak. Watch them hand off as the conversation moves from intake to a recommendation."}
        </p>

        {/* Voice panel */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-full text-white",
                  patientSpeaking ? "bg-slate-400" : "bg-gradient-to-br from-emerald-500 to-teal-600",
                )}
              >
                {patientSpeaking ? <Mic className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </span>
              <div>
                <p className="text-xs text-slate-400">{patientSpeaking ? "Speaking" : "Now speaking"}</p>
                <p className="text-sm font-semibold text-slate-900">
                  {patientSpeaking ? "You" : AGENTS.find((a) => a.key === activeAgent)?.label ?? "Covera"}
                </p>
              </div>
            </div>

            {/* waveform */}
            <div className="flex h-8 items-center gap-1" aria-hidden>
              {WAVE.map((b, i) =>
                speaking ? (
                  <motion.span
                    key={i}
                    className="w-1 rounded-full bg-emerald-500"
                    animate={{ height: [`${b * 30 + 15}%`, `${b * 75 + 25}%`, `${b * 30 + 15}%`] }}
                    transition={{ duration: 0.55 + i * 0.06, repeat: Infinity, ease: "easeInOut" }}
                  />
                ) : (
                  <span
                    key={i}
                    className={cn("w-1 rounded-full", patientSpeaking ? "bg-slate-300" : "bg-slate-200")}
                    style={{ height: `${b * 30 + 15}%` }}
                  />
                ),
              )}
            </div>
          </div>

          {/* current line */}
          <div className="mt-3 min-h-[3.5rem] rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm leading-snug text-slate-700">
            {latest ? latest.text : "…"}
          </div>

          {/* agent hand-off rail */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {AGENTS.map((a) => {
              const active = a.key === activeAgent && !patientSpeaking;
              return (
                <span
                  key={a.key}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    active
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-500",
                  )}
                >
                  {a.label}
                </span>
              );
            })}
          </div>
        </div>

        {/* controls */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
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
          <button
            type="button"
            onClick={() => setVoiceOn((v) => !v)}
            aria-pressed={voiceOn}
            className={cn(
              "inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors",
              voiceOn
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
            )}
          >
            {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            {voiceOn ? "Voice on" : "Hear it"}
          </button>

          <div className="h-1 w-28 overflow-hidden rounded-full bg-slate-200">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
              animate={{ width: `${pctDone}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          This preview uses your browser&apos;s voice. The real, emotional multi-agent voice lives on
          the{" "}
          <Link href="/patient" className="font-medium text-emerald-700 underline-offset-2 hover:underline">
            patient tab
          </Link>
          . Figures here are illustrative; the tabs produce the genuine numbers.
        </p>
      </div>
    </div>
  );
}

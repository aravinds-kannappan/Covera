"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Mic, Send, ShieldCheck, Volume2, VolumeX } from "lucide-react";
import type { ConciergeConsult } from "@/lib/agents/mesh/consult";
import type { AgentEvent } from "@/lib/agents/runtime";
import { useRecorder, usePlayer } from "@/lib/voice/client";
import { useSpeech } from "@/lib/voice";
import { usd } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Role = "hospital" | "employer";
interface Msg {
  role: "user" | "agent";
  text: string;
  consults?: ConciergeConsult[];
}

// A voice-first desk agent. A physician (hospital) or an HR contact (employer) speaks to it, and
// it consults the patient's concierge and answers out loud. The consult exchange is shown so you
// can SEE the agents talking to each other. Reuses the same voice layer as the patient concierge.
export function AgentConsole({
  role,
  state = "TX",
  persona,
}: {
  role: Role;
  state?: string;
  persona: "clinical" | "employer";
}) {
  const greeting =
    role === "hospital"
      ? "Hospital cost desk. Paste the patient's Coverage Card link, then ask me what a procedure will cost them, or tap the mic and just ask."
      : "Employer benefits desk. Ask me what your team would pay on the marketplace, or how an ICHRA compares. Tap the mic and talk.";

  const [messages, setMessages] = useState<Msg[]>(() => [{ role: "agent", text: greeting }]);
  const [input, setInput] = useState("");
  const [cardToken, setCardToken] = useState("");
  const [busy, setBusy] = useState(false);
  // The current step in the live agent exchange (e.g. "Consulting the concierge…"), shown while
  // the SSE stream is mid-flight so the hand-off is visible instead of a blank wait.
  const [phase, setPhase] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [muted, setMuted] = useState(false);
  const [sttFallback, setSttFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const browserTranscript = useRef<string>("");
  const recorder = useRecorder();
  const player = usePlayer();
  const speech = useSpeech();

  useEffect(() => () => player.stop(), [player]);

  async function speak(text: string) {
    if (muted || !text) return;
    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, persona }),
      });
      const data = await res.json().catch(() => null);
      if (data && data.source === "elevenlabs" && data.audioBase64) player.play(data.audioBase64, data.mime, text);
      else player.play("", "", text);
    } catch {
      player.play("", "", text);
    }
  }

  // What each tool call means in plain language, for the live status line.
  function phaseLabel(name: string): string {
    if (name === "consult_concierge") return "Consulting the patient's concierge…";
    if (name === "consult_marketplace") return "Asking the concierge on the employee's behalf…";
    if (name === "procedure_range") return "Looking up the typical cross-plan range…";
    return "Working…";
  }

  async function sendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError(null);
    setInput("");
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    // Append the user turn plus a placeholder agent message we fill in as events stream in.
    const agentIndex = messages.length + 1;
    setMessages((m) => [...m, { role: "user", text: trimmed }, { role: "agent", text: "", consults: [] }]);
    setBusy(true);
    setPhase(null);

    const patchAgent = (patch: Partial<Msg>) =>
      setMessages((m) => m.map((msg, i) => (i === agentIndex ? { ...msg, ...patch } : msg)));
    const dropAgent = () => setMessages((m) => m.filter((_, i) => i !== agentIndex));

    try {
      const res = await fetch("/api/mesh/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, history, text: trimmed, state, cardToken: cardToken.trim() || undefined }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "The desk agent is unavailable right now.");
        dropAgent();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const consults: ConciergeConsult[] = [];
      let finalText = "";

      // Parse the SSE stream frame by frame (frames are separated by a blank line).
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith("data:")) continue;
          let payload: { type: string; event?: AgentEvent; text?: string; consults?: ConciergeConsult[]; error?: string };
          try {
            payload = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          if (payload.type === "event" && payload.event) {
            const e = payload.event;
            if (e.kind === "tool_call") setPhase(phaseLabel(e.name));
            if (e.kind === "tool_result" && e.consult) {
              consults.push(e.consult);
              patchAgent({ consults: [...consults] });
            }
            if ((e.kind === "assistant" || e.kind === "final") && e.text) {
              finalText = e.text;
              patchAgent({ text: e.text });
              setPhase(null);
            }
          } else if (payload.type === "done") {
            finalText = payload.text ?? finalText;
            patchAgent({ text: finalText, consults: payload.consults ?? consults });
            setPhase(null);
          } else if (payload.type === "error") {
            setError(payload.error ?? "The desk agent is unavailable right now.");
            dropAgent();
            return;
          }
        }
      }

      if (finalText) void speak(finalText);
      else dropAgent();
    } catch {
      setError("Network hiccup: try again.");
      dropAgent();
    } finally {
      setBusy(false);
      setPhase(null);
    }
  }

  async function transcribeClip(base64: string, mime: string) {
    setTranscribing(true);
    try {
      const res = await fetch("/api/voice/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audioBase64: base64, mime }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.source === "unconfigured") {
        setSttFallback(true);
        setError("Using your browser's mic (cloud voice isn't configured). Tap the mic and speak again.");
      } else if (data.text) {
        void sendText(data.text);
      } else {
        setError(data.note || "I couldn't catch that. Try again or type it.");
      }
    } catch {
      setError("Transcription failed. Type it instead.");
    } finally {
      setTranscribing(false);
    }
  }

  async function handleMic() {
    if (busy || transcribing) return;
    player.stop();
    if (sttFallback || !recorder.supported) {
      if (speech.listening) {
        speech.stop();
        const t = browserTranscript.current.trim();
        browserTranscript.current = "";
        if (t) void sendText(t);
      } else {
        browserTranscript.current = "";
        speech.start((t) => (browserTranscript.current = t));
      }
      return;
    }
    if (recorder.recording) {
      const clip = await recorder.stop();
      if (clip?.base64) void transcribeClip(clip.base64, clip.mime);
    } else {
      void recorder.start();
    }
  }

  const listening = recorder.recording || speech.listening;
  const thinking = busy || transcribing;
  const last = messages[messages.length - 1];
  const consult = last?.role === "agent" ? last.consults?.[0] : undefined;
  // While streaming, show the live step (or partial reply) instead of a static "one moment".
  const orbLine = (last?.role === "agent" && last.text) || (thinking ? phase ?? "One moment…" : last?.text ?? "");

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between">
        <span className="label-mono text-[10px] text-indigo-600">
          {role === "hospital" ? "Cost desk agent" : "Benefits desk agent"}
        </span>
        <span className={cn("label-mono text-[10px]", listening ? "text-rose-500" : thinking ? "text-indigo-600" : "text-slate-400")}>
          {listening ? "Listening" : thinking ? "Thinking" : "Ready"}
        </span>
      </div>

      {/* orb + current line */}
      <div className="mt-4 flex flex-col items-center">
        <button
          type="button"
          onClick={handleMic}
          disabled={thinking}
          aria-label={listening ? "Stop and send" : "Tap to talk"}
          className="relative grid place-items-center disabled:cursor-wait"
        >
          {(listening || player.playing) && (
            <span className={cn("absolute h-28 w-28 rounded-full", listening ? "bg-rose-400/20" : "bg-indigo-400/20", "animate-orb-pulse")} />
          )}
          <span
            className={cn(
              "relative grid h-24 w-24 place-items-center rounded-full text-white",
              listening ? "bg-gradient-to-br from-rose-400 to-rose-600" : "bg-gradient-to-br from-indigo-500 to-indigo-700",
            )}
          >
            {transcribing ? <Loader2 className="h-7 w-7 animate-spin" /> : <Mic className="h-7 w-7" />}
          </span>
        </button>
        <AnimatePresence mode="wait">
          <motion.p
            key={orbLine}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className="mt-4 min-h-[3rem] max-w-md text-center font-serif text-base leading-snug text-slate-800"
          >
            {orbLine}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* the visible agent-to-agent consult */}
      {consult && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
          <p className="label-mono flex items-center gap-1 text-[10px] text-indigo-700">
            <ShieldCheck className="h-3 w-3" /> Concierge → this desk
          </p>
          {consult.ok ? (
            <div className="mt-2 text-sm text-slate-700">
              {consult.member && <p className="font-medium text-slate-900">{consult.member} · {consult.plan}</p>}
              {consult.coverage && (
                <p className="mt-1 text-slate-600">
                  Deductible {usd(consult.coverage.deductible)} · OOP max {usd(consult.coverage.oopMax)}
                </p>
              )}
              {consult.estimate && (
                <p className="mt-1 tabular-nums text-slate-600">
                  {consult.estimate.procedure}: {usd(consult.estimate.ifDeductibleUnmet)} before the deductible, {usd(consult.estimate.ifDeductibleMet)} after.
                </p>
              )}
              <p className="mt-2 text-xs text-slate-400">{consult.note}</p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-slate-500">{consult.note}</p>
          )}
        </motion.div>
      )}

      {/* card link (hospital) */}
      {role === "hospital" && (
        <input
          value={cardToken}
          onChange={(e) => setCardToken(e.target.value)}
          placeholder="Paste the patient's Coverage Card link…"
          className="mt-4 h-9 w-full rounded-full border border-slate-200 bg-slate-50 px-3.5 text-[13px] outline-none focus:border-indigo-400"
        />
      )}

      {/* controls */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (!muted) player.stop();
            setMuted((v) => !v);
          }}
          aria-label={muted ? "Unmute" : "Mute"}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendText(input);
          }}
          className="flex flex-1 items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="or type instead…"
            className="h-9 flex-1 rounded-full border border-slate-200 bg-white px-3.5 text-[13px] outline-none focus:border-indigo-400"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="grid h-9 w-9 place-items-center rounded-full bg-indigo-600 text-white disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
    </div>
  );
}

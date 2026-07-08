"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Loader2, Mic, Send, Volume2, VolumeX } from "lucide-react";
import type { ConvoMessage, PlansMeta } from "@/lib/agents/types";
import { useCovera } from "@/lib/store";
import { useRecorder, usePlayer } from "@/lib/voice/client";
import { useSpeech } from "@/lib/voice";
import { PlanChoiceModal } from "@/components/patient/plan-choice-modal";
import { cn } from "@/lib/utils";

const OPENERS = [
  "I want to talk through my options",
  "I'm scared of a surprise bill",
  "My job's plan is $380 a month, is that fair?",
];

// Which specialist is "speaking", from the reply's meta panel, so the voice shows a hand-off.
function metaPersonaLabel(kind?: string): string {
  switch (kind) {
    case "profile":
      return "Intake";
    case "plans":
    case "whatif":
    case "marketplace":
    case "recheck":
      return "Advisor";
    case "hospital":
    case "estimate":
    case "billaudit":
    case "appeal":
      return "Cost desk";
    case "outreach":
      return "Benefits";
    default:
      return "Covera";
  }
}

/**
 * The voice concierge: you speak, it answers out loud, one line at a time. It is the same
 * multi-agent brain as the text console (via /api/sms/send on the cheap Baseten model), but a
 * voice-first surface, not a chat thread: an orb you talk to, the current line, and which agent is
 * speaking. When it has enough it pops up your ranked real-CMS plans to choose from. Speech-to-text
 * runs on ElevenLabs (browser-speech fallback when unconfigured); replies speak in a per-agent
 * voice, or the browser voice as a fallback. Audio is only ever sent on an explicit tap.
 */
export function VoiceConcierge() {
  const storedProfile = useCovera((s) => s.profile);

  const [messages, setMessages] = useState<ConvoMessage[]>(() => [
    {
      role: "agent",
      ts: 0,
      text: storedProfile?.state
        ? `Hi, I'm Covera. I can see you're in ${storedProfile.state}. Tap the circle and tell me what's going on with your health and your budget. Talk to me like a person.`
        : "Hi, I'm Covera. Tap the circle and tell me about yourself: your state, roughly what you earn, any conditions or meds, and what worries you about health costs.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [sttFallback, setSttFallback] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [modalMeta, setModalMeta] = useState<PlansMeta | null>(null);

  const sessionId = useRef<string>("");
  const browserTranscript = useRef<string>("");
  const transcriptRef = useRef<HTMLDivElement>(null);

  const recorder = useRecorder();
  const player = usePlayer();
  const speech = useSpeech();

  useEffect(() => {
    if (!sessionId.current) sessionId.current = "voice:" + Math.random().toString(36).slice(2);
  }, []);
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, showTranscript]);

  async function speak(msg: ConvoMessage) {
    if (muted || !msg.text) return;
    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: msg.text, metaKind: msg.meta?.kind }),
      });
      const data = await res.json().catch(() => null);
      if (data && data.source === "elevenlabs" && data.audioBase64) {
        player.play(data.audioBase64, data.mime, msg.text);
      } else {
        player.play("", "", msg.text);
      }
    } catch {
      player.play("", "", msg.text);
    }
  }

  async function sendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError(null);
    setInput("");
    setMessages((m) => [...m, { role: "patient", text: trimmed, ts: Date.now() }]);
    setBusy(true);
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId.current, text: trimmed, provider: "baseten" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "The voice agent is unavailable right now.");
      } else {
        const replies = (data.replies as ConvoMessage[]) ?? [];
        setMessages((m) => [...m, ...replies]);
        const last = replies[replies.length - 1];
        if (last) {
          void speak(last);
          if (last.meta && (last.meta.kind === "plans" || last.meta.kind === "whatif")) {
            setModalMeta(last.meta.data as PlansMeta);
          }
        }
      }
    } catch {
      setError("Network hiccup: try again.");
    } finally {
      setBusy(false);
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
        setError("Using your browser's mic (cloud voice isn't configured). Tap the circle and speak again.");
      } else if (data.text) {
        void sendText(data.text);
      } else {
        setError(data.note || "I couldn't catch that. Try again, or type it below.");
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
  const speaking = player.playing;
  const statusLabel = listening ? "Listening" : thinking ? "Thinking" : speaking ? "Speaking" : "Ready";
  const active = listening || speaking;

  const lastMsg = messages[messages.length - 1];
  const currentLine = thinking ? "One moment…" : lastMsg?.text ?? "Tap to talk.";
  const speakerLabel = lastMsg?.role === "patient" ? "You" : metaPersonaLabel(lastMsg?.meta?.kind);

  return (
    <div className="mx-auto max-w-md">
      {/* Voice card (the "app frame") */}
      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-indigo-950/5">
        {/* header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <span className="inline-flex items-center gap-1.5 font-serif text-base text-slate-900">
            Covera <span className="h-1 w-1 rounded-full bg-indigo-500" />
          </span>
          <span className={cn("label-mono text-[10px]", active ? "text-indigo-600" : "text-slate-400")}>
            {statusLabel}
          </span>
        </div>

        {/* orb */}
        <div className="flex flex-col items-center px-6 pb-8 pt-10">
          <button
            type="button"
            onClick={handleMic}
            disabled={thinking}
            aria-label={listening ? "Stop and send" : "Tap to talk"}
            className="relative grid place-items-center outline-none disabled:cursor-wait"
          >
            {/* pulsing rings when active */}
            <AnimatePresence>
              {active &&
                [0, 1].map((i) => (
                  <motion.span
                    key={i}
                    className={cn(
                      "absolute rounded-full",
                      listening ? "bg-rose-400/20" : "bg-indigo-400/20",
                    )}
                    style={{ width: 168, height: 168 }}
                    initial={{ scale: 0.85, opacity: 0.5 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.9, ease: "easeOut" }}
                  />
                ))}
            </AnimatePresence>
            <span
              className={cn(
                "relative grid h-[168px] w-[168px] place-items-center rounded-full text-white transition-colors duration-500",
                listening
                  ? "bg-gradient-to-br from-rose-400 to-rose-600"
                  : speaking
                    ? "bg-gradient-to-br from-indigo-400 to-indigo-600"
                    : "bg-gradient-to-br from-indigo-500 to-indigo-700",
              )}
            >
              {transcribing ? (
                <Loader2 className="h-9 w-9 animate-spin" />
              ) : (
                <Mic className="h-9 w-9" />
              )}
            </span>
          </button>

          {/* waveform */}
          <div className="mt-6 flex h-6 items-center gap-1" aria-hidden>
            {[0.5, 0.8, 1, 0.65, 0.9, 0.55, 0.75].map((b, i) =>
              active ? (
                <motion.span
                  key={i}
                  className={cn("w-1 rounded-full", listening ? "bg-rose-400" : "bg-indigo-500")}
                  animate={{ height: [`${b * 30 + 15}%`, `${b * 85 + 15}%`, `${b * 30 + 15}%`] }}
                  transition={{ duration: 0.5 + i * 0.06, repeat: Infinity, ease: "easeInOut" }}
                />
              ) : (
                <span key={i} className="w-1 rounded-full bg-slate-200" style={{ height: `${b * 26 + 12}%` }} />
              ),
            )}
          </div>

          {/* current line + speaker */}
          <p className="label-mono mt-6 text-[10px] text-indigo-600">{speakerLabel}</p>
          <AnimatePresence mode="wait">
            <motion.p
              key={currentLine}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              className="mt-2 min-h-[3.5rem] max-w-sm text-center font-serif text-lg leading-snug text-slate-800"
            >
              {currentLine}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* controls */}
        <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              if (!muted) player.stop();
              setMuted((v) => !v);
            }}
            aria-label={muted ? "Unmute voice" : "Mute voice"}
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
      </div>

      {/* starter chips (examples only), early in the conversation */}
      {messages.length <= 1 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {OPENERS.map((s) => (
            <button
              key={s}
              onClick={() => void sendText(s)}
              disabled={busy || transcribing}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-center text-sm text-rose-600">{error}</p>}

      {/* transcript disclosure (accessibility / a written record, not the primary surface) */}
      {messages.length > 1 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            className="label-mono mx-auto flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600"
          >
            Transcript
            <ChevronDown className={cn("h-3 w-3 transition-transform", showTranscript && "rotate-180")} />
          </button>
          <AnimatePresence>
            {showTranscript && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div ref={transcriptRef} className="scroll-thin mt-3 max-h-56 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                  {messages.map((m, i) => (
                    <p key={i} className="leading-snug">
                      <span className={cn("label-mono mr-2 text-[10px]", m.role === "patient" ? "text-slate-400" : "text-indigo-600")}>
                        {m.role === "patient" ? "You" : "Covera"}
                      </span>
                      <span className="text-slate-700">{m.text}</span>
                    </p>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <p className="mt-5 text-center text-xs text-slate-400">
        Voice needs a mic. With no cloud voice configured it uses your browser&apos;s speech, and you
        can always type. Decision support, not insurance advice.
      </p>

      {modalMeta && (
        <PlanChoiceModal
          meta={modalMeta}
          onClose={() => setModalMeta(null)}
          onPick={(planName) => {
            setModalMeta(null);
            void sendText(`I'll go with ${planName}.`);
          }}
        />
      )}
    </div>
  );
}

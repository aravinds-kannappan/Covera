"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Loader2, Mic, Send, Sparkles, Volume2, VolumeX } from "lucide-react";
import type { ConvoMessage, PlansMeta } from "@/lib/agents/types";
import { useCovera } from "@/lib/store";
import { useRecorder, usePlayer } from "@/lib/voice/client";
import { useSpeech } from "@/lib/voice";
import { PhoneFrame } from "@/components/text/phone-frame";
import { MessageBubble, TypingBubble } from "@/components/text/message-bubble";
import { PlanChoiceModal } from "@/components/patient/plan-choice-modal";
import { cn } from "@/lib/utils";

const OPENERS = [
  "I want to talk through my options",
  "I'm scared of a surprise bill",
  "My job's plan is $380 a month, is that fair?",
  "I take a daily medication, does that matter?",
];

function personaLabel(p?: string): string {
  switch (p) {
    case "intake":
      return "Intake";
    case "advisor":
      return "Advisor";
    case "clinical":
      return "Cost desk";
    case "employer":
      return "Benefits";
    default:
      return "Covera";
  }
}

/**
 * The voice concierge: the same multi-agent brain as the text console, but you speak to it. It
 * asks about your life, and once it has enough it pops up a modal of your ranked real-CMS plans
 * to choose from. Voice input runs on ElevenLabs speech-to-text (with a browser-speech fallback
 * when voice is not configured); replies are spoken back in a per-agent voice, or the browser
 * voice as a fallback. It reuses /api/sms/send with the cheap Baseten brain.
 */
export function VoiceConcierge() {
  const storedProfile = useCovera((s) => s.profile);

  // Lazy initializer so the greeting is built once, off the render path (ts is cosmetic here).
  const [messages, setMessages] = useState<ConvoMessage[]>(() => [
    {
      role: "agent",
      ts: 0,
      text: storedProfile?.state
        ? `Hi, I'm Covera. I can see you're in ${storedProfile.state}. Tap the mic and tell me what's going on with your health and your budget, and we'll find the plan that actually fits. You can talk to me like a person.`
        : "Hi, I'm Covera. Tap the mic and tell me about yourself: your state, roughly what you earn, any conditions or meds, and what worries you about health costs. We'll talk it through and I'll pull up your best plans.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("intake");
  const [muted, setMuted] = useState(false);
  const [voiceLabel, setVoiceLabel] = useState<string>("");
  const [sttFallback, setSttFallback] = useState(false);
  const [modalMeta, setModalMeta] = useState<PlansMeta | null>(null);

  const sessionId = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const browserTranscript = useRef<string>("");

  const recorder = useRecorder();
  const player = usePlayer();
  const speech = useSpeech(); // browser Web Speech fallback (free, no key)

  useEffect(() => {
    if (!sessionId.current) sessionId.current = "voice:" + Math.random().toString(36).slice(2);
  }, []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, transcribing]);

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
        setVoiceLabel(personaLabel(data.persona));
        player.play(data.audioBase64, data.mime, msg.text);
      } else {
        setVoiceLabel("browser voice");
        player.play("", "", msg.text); // graceful fallback: browser speech
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
        if (data.status) setStatus(data.status);
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
        // No ElevenLabs: switch the mic to the free browser recognizer from here on.
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

    // Fallback path: the browser's built-in speech recognition (free, no key).
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

    // Primary path: record a clip and transcribe it with ElevenLabs.
    if (recorder.recording) {
      const clip = await recorder.stop();
      if (clip?.base64) void transcribeClip(clip.base64, clip.mime);
    } else {
      void recorder.start();
    }
  }

  const listening = recorder.recording || speech.listening;
  const lastAgent = [...messages].reverse().find((m) => m.role === "agent");
  const suggestions =
    status === "finalized"
      ? ["Message my employer about it", "What would a hospital visit cost me?"]
      : lastAgent?.meta?.kind === "plans" || lastAgent?.meta?.kind === "whatif"
        ? ["Which would you pick for me?", "What if I get pregnant?", "Compare to my job's plan"]
        : OPENERS;

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,360px)_1fr]">
      <PhoneFrame>
        <div ref={scrollRef} className="scroll-thin h-[460px] space-y-3 overflow-y-auto bg-slate-50/60 px-3 py-4">
          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} onAsk={sendText} />
          ))}
          <AnimatePresence>{(busy || transcribing) && <TypingBubble />}</AnimatePresence>
        </div>

        <div className="border-t border-slate-100 bg-white p-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleMic}
              disabled={busy || transcribing}
              aria-label={listening ? "Stop and send" : "Hold to talk"}
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition-all disabled:opacity-40",
                listening
                  ? "animate-pulse bg-gradient-to-br from-rose-500 to-red-600 ring-4 ring-rose-200"
                  : "bg-gradient-to-br from-emerald-500 to-teal-600",
              )}
            >
              {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
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
                placeholder={listening ? "Listening… tap the mic to send" : "Speak, or type instead…"}
                className="h-9 flex-1 rounded-full border border-slate-200 bg-slate-50 px-3.5 text-[13px] outline-none focus:border-emerald-400"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white disabled:opacity-40"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>

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
          </div>
        </div>
      </PhoneFrame>

      <div>
        <h3 className="text-2xl font-semibold tracking-tight text-slate-900">Talk it through</h3>
        <p className="mt-2 max-w-md text-slate-600">
          Prefer to just talk? Tap the mic and have a real conversation. The same agents run the real
          CMS-data simulation while you speak, and when they have enough, your ranked plans pop up to
          choose from. Everything you hear about cost is a real simulated number, not a guess.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
            <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
            {muted ? "Voice muted" : player.playing ? `Speaking · ${voiceLabel || "Covera"}` : "Voice on"}
          </span>
          {listening && <span className="text-rose-600">● listening</span>}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => void sendText(s)}
              disabled={busy || transcribing}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <p className="mt-4 text-xs text-slate-400">
          Voice needs a mic. With no cloud voice configured it uses your browser&apos;s built-in
          speech, and you can always type instead. Decision support, not insurance advice.
        </p>
      </div>

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

"use client";
import { useRef, useState } from "react";
import {
  Loader2,
  Mic,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  Wand2,
} from "lucide-react";
import type { PatientProfile } from "@/lib/types";
import type { OptimizeResult } from "@/lib/sim/optimize";
import { streamAgent, type AgentScenarioResult } from "@/lib/api";
import { useSpeech } from "@/lib/voice";
import { cn, usd } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface Msg {
  role: "user" | "assistant";
  content: string;
  scenario?: AgentScenarioResult;
}

// Covera texts in plain prose, but a model can still slip in markdown. Strip it so the
// bubble never shows raw ** ** or * bullets (also handles partial tokens mid-stream).
function cleanText(s: string): string {
  return s
    .replace(/^\s*[-*]\s+/gm, "• ") // list markers to a bullet dot
    .replace(/^#{1,6}\s+/gm, "") // headers
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/\*/g, "") // any remaining asterisks (bold/italic/stray)
    .replace(/_{1,2}([^_]+)_{1,2}/g, "$1"); // underscores emphasis
}

const SUGGESTIONS = [
  "Why is the top plan best for me?",
  "What if I get pregnant this year?",
  "What if my income dropped to $30k?",
  "Which plan is safest in a bad year?",
];

function buildSummary(result: OptimizeResult): string {
  return result.ranked
    .slice(0, 8)
    .map(
      (r, i) =>
        `#${i + 1} ${r.plan.metal} "${r.plan.marketingName}" (${r.plan.issuer}): ` +
        `expected ${usd(r.sim.expectedTotal)}/yr, premium ${usd(r.sim.annualPremium)}/yr, ` +
        `bad-year ${usd(r.sim.p90)}, deductible ${usd(r.plan.deductible)}, OOP max ${usd(r.plan.oopMax)}, ` +
        `${Math.round(r.sim.probHitOOPMax * 100)}% chance of hitting the OOP max`,
    )
    .join("\n");
}

export function Assistant({
  profile,
  result,
}: {
  profile: PatientProfile;
  result: OptimizeResult;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [toolRunning, setToolRunning] = useState(false);
  const [speakOn, setSpeakOn] = useState(false);
  const speech = useSpeech();
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || streaming) return;
    setInput("");
    const history = [...messages, { role: "user" as const, content: q }];
    const idx = history.length;
    setMessages([...history, { role: "assistant", content: "" }]);
    setStreaming(true);
    let acc = "";
    await streamAgent(
      {
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        profile,
        plansSummary: buildSummary(result),
      },
      {
        onText: (d) => {
          acc += d;
          setMessages((m) => {
            const c = [...m];
            if (c[idx]) c[idx] = { ...c[idx], content: acc };
            return c;
          });
          scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
        },
        onTool: () => setToolRunning(true),
        onToolResult: (r) => {
          setToolRunning(false);
          setMessages((m) => {
            const c = [...m];
            if (c[idx]) c[idx] = { ...c[idx], scenario: r };
            return c;
          });
        },
        onError: (e) => {
          acc += `\n\n(${e})`;
          setMessages((m) => {
            const c = [...m];
            if (c[idx]) c[idx] = { ...c[idx], content: acc };
            return c;
          });
        },
        onDone: () => {
          setStreaming(false);
          setToolRunning(false);
          if (speakOn && acc) speech.speak(acc.replace(/[*_#`]/g, ""));
        },
      },
    );
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Ask Covera</p>
            <p className="text-xs text-slate-500">
              Grounded in your real plans · runs live what-ifs
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setSpeakOn((s) => !s);
            speech.cancelSpeak();
          }}
          title={speakOn ? "Mute replies" : "Read replies aloud"}
          className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          {speakOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
      </div>

      <div ref={scrollRef} className="scroll-thin max-h-[420px] overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-slate-500">
              Ask anything about your coverage, or try a scenario.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={cn(m.role === "user" ? "flex justify-end" : "")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    m.role === "user"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-800",
                  )}
                >
                  <span className="whitespace-pre-wrap">
                    {m.role === "assistant" ? cleanText(m.content) : m.content}
                  </span>
                  {m.role === "assistant" && !m.content && streaming && (
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> thinking…
                    </span>
                  )}
                  {m.scenario && <ScenarioCard scenario={m.scenario} />}
                </div>
              </div>
            ))}
            {toolRunning && (
              <div className="flex items-center gap-1.5 text-xs text-indigo-600">
                <Wand2 className="h-3.5 w-3.5" /> running a fresh simulation…
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-2">
          {speech.supported && (
            <button
              onClick={() =>
                speech.listening
                  ? speech.stop()
                  : speech.start((t) => setInput(t))
              }
              title={speech.listening ? "Stop" : "Speak"}
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors",
                speech.listening
                  ? "animate-pulse bg-rose-500 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200",
              )}
            >
              <Mic className="h-4 w-4" />
            </button>
          )}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="Ask about your plans, or a what-if…"
            className="h-10 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
          <button
            onClick={() => send(input)}
            disabled={streaming || !input.trim()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
          >
            {streaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScenarioCard({ scenario }: { scenario: AgentScenarioResult }) {
  return (
    <div className="mt-3 rounded-xl border border-indigo-200 bg-white p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-indigo-700">
        <Wand2 className="h-3.5 w-3.5" /> Simulated: {scenario.label}
      </p>
      <div className="space-y-1.5">
        {scenario.topPlans.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 truncate text-slate-600">
              <Badge tone="emerald">{p.metal}</Badge>
              <span className="truncate">{p.name}</span>
            </span>
            <span className="shrink-0 font-semibold text-slate-900">
              {usd(p.expectedTotal)}/yr
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

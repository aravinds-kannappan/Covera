"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";

// The centerpiece: what makes Covera's voice unique. You speak to one Concierge, and behind it a
// team of agents talks to EACH OTHER, then out to your hospital and employer on your behalf. This
// animates that flow as a living network of voice, not another phone. Illustrative script; the
// tabs run the real simulation.

type NodeId =
  | "you"
  | "concierge"
  | "advisor"
  | "marketplace"
  | "costdesk"
  | "advocate"
  | "hospital"
  | "employer";

interface Node {
  id: NodeId;
  label: string;
  x: number;
  y: number;
  r: number;
  kind: "you" | "lead" | "agent" | "party";
}

const NODES: Node[] = [
  { id: "you", label: "You", x: 360, y: 500, r: 30, kind: "you" },
  { id: "concierge", label: "Concierge", x: 360, y: 330, r: 34, kind: "lead" },
  { id: "advisor", label: "Advisor", x: 190, y: 330, r: 26, kind: "agent" },
  { id: "marketplace", label: "Marketplace", x: 530, y: 330, r: 26, kind: "agent" },
  { id: "costdesk", label: "Cost desk", x: 250, y: 225, r: 26, kind: "agent" },
  { id: "advocate", label: "Advocate", x: 470, y: 225, r: 26, kind: "agent" },
  { id: "hospital", label: "Hospital", x: 165, y: 110, r: 28, kind: "party" },
  { id: "employer", label: "Employer", x: 555, y: 110, r: 28, kind: "party" },
];

const LINKS: [NodeId, NodeId][] = [
  ["you", "concierge"],
  ["concierge", "advisor"],
  ["concierge", "marketplace"],
  ["concierge", "costdesk"],
  ["concierge", "advocate"],
  ["costdesk", "hospital"],
  ["advocate", "employer"],
];

interface Phase {
  from: NodeId;
  to: NodeId;
  speaker: string;
  line: string;
}

// The story: you speak, the agents confer, then reach your employer and hospital for you.
const PHASES: Phase[] = [
  { from: "you", to: "concierge", speaker: "You", line: "I'm 34, in Texas, and scared of a bill I can't pay." },
  { from: "concierge", to: "advisor", speaker: "Concierge → Advisor", line: "Rank real plans on her bad-year risk, not just premium." },
  { from: "advisor", to: "concierge", speaker: "Advisor → Concierge", line: "Gold caps her worst year at $8,550. It's the safe pick." },
  { from: "concierge", to: "marketplace", speaker: "Concierge → Marketplace", line: "Compare that to her employer's offer, net of subsidy." },
  { from: "concierge", to: "you", speaker: "Concierge → You", line: "The Gold plan fits you. Want me to set it up?" },
  { from: "advocate", to: "employer", speaker: "Advocate → Employer", line: "Reaching your benefits team to coordinate enrollment." },
  { from: "costdesk", to: "hospital", speaker: "Cost desk → Hospital", line: "Confirming your procedure's in-network cost, on your card." },
];

const nodeById = (id: NodeId) => NODES.find((n) => n.id === id)!;

function nodeFill(kind: Node["kind"], active: boolean): string {
  if (active) return "fill-indigo-500";
  if (kind === "party") return "fill-white";
  if (kind === "you") return "fill-slate-200";
  return "fill-indigo-50";
}

export function AgentNetwork() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPhase((p) => (p + 1) % PHASES.length), 2900);
    return () => clearInterval(t);
  }, []);

  const active = PHASES[phase];
  const from = nodeById(active.from);
  const to = nodeById(active.to);
  const litNow = new Set<NodeId>([active.from, active.to]);

  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
      {/* The network */}
      <div className="relative">
        <svg viewBox="0 0 720 560" className="w-full" role="img" aria-label="Covera's agents talking to each other and to your hospital and employer">
          {/* static links */}
          {LINKS.map(([a, b]) => {
            const na = nodeById(a);
            const nb = nodeById(b);
            const isActive = (a === active.from && b === active.to) || (a === active.to && b === active.from);
            return (
              <line
                key={`${a}-${b}`}
                x1={na.x}
                y1={na.y}
                x2={nb.x}
                y2={nb.y}
                className={isActive ? "stroke-indigo-400" : "stroke-slate-200"}
                strokeWidth={isActive ? 2 : 1.25}
                strokeLinecap="round"
              />
            );
          })}

          {/* traveling voice pulse along the active link */}
          <motion.circle
            key={phase}
            r={5}
            className="fill-indigo-500"
            initial={{ cx: from.x, cy: from.y, opacity: 0 }}
            animate={{ cx: to.x, cy: to.y, opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.5, ease: "easeInOut", times: [0, 0.15, 0.85, 1] }}
          />

          {/* nodes */}
          {NODES.map((n) => {
            const isLit = litNow.has(n.id);
            return (
              <g key={n.id}>
                {isLit && (
                  <motion.circle
                    cx={n.x}
                    cy={n.y}
                    r={n.r}
                    className="fill-indigo-400/20"
                    initial={{ scale: 0.9, opacity: 0.6 }}
                    animate={{ scale: 1.35, opacity: 0 }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                    style={{ transformOrigin: `${n.x}px ${n.y}px` }}
                  />
                )}
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.r}
                  className={`${nodeFill(n.kind, isLit)} transition-colors duration-500 ${
                    n.kind === "party" ? "stroke-slate-300" : "stroke-indigo-200"
                  }`}
                  strokeWidth={1.5}
                />
                <text
                  x={n.x}
                  y={n.y + n.r + 16}
                  textAnchor="middle"
                  className={`fill-slate-500 ${isLit ? "fill-indigo-700" : ""}`}
                  style={{ fontSize: 12, fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}
                >
                  {n.label.toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Narrative */}
      <div>
        <p className="label-mono text-[11px] text-indigo-600">One conversation, a whole team</p>
        <h2 className="mt-3 font-serif text-3xl font-medium tracking-tight text-slate-900 sm:text-4xl">
          You talk to one agent. It talks to all of them.
        </h2>
        <p className="mt-4 max-w-md leading-relaxed text-slate-600">
          Speak once. Your concierge confers with the specialists (each running the real CMS-data
          simulation), then reaches out to your hospital and employer on your behalf. You never
          repeat yourself, and you never chase anyone.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white/70 p-5 shadow-sm">
          <motion.div key={phase} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <p className="label-mono text-[10px] text-indigo-600">{active.speaker}</p>
            <p className="mt-1.5 font-serif text-lg leading-snug text-slate-800">{active.line}</p>
          </motion.div>
          <div className="mt-4 flex gap-1.5">
            {PHASES.map((_, i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${i === phase ? "bg-indigo-500" : "bg-slate-200"}`}
              />
            ))}
          </div>
        </div>

        <p className="mt-4 label-mono text-[10px] text-slate-400">
          Illustrative · figures come from the real simulation on the tabs
        </p>
      </div>
    </div>
  );
}

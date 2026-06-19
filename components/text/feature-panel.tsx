import type { MessageMeta } from "@/lib/agents/types";
import { usd } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// Renders the rich payload that rides along with an agent text bubble. This is the
// "feature pops in as you scroll" surface — each tool the agent calls produces a small
// card here (a profile read, a plan ranking, a marketplace verdict, a cost range, an
// outreach draft).

const metalTone: Record<string, "amber" | "neutral" | "violet" | "sky" | "rose"> = {
  Bronze: "amber",
  "Expanded Bronze": "amber",
  Silver: "neutral",
  Gold: "violet",
  Platinum: "sky",
  Catastrophic: "rose",
};

export function FeaturePanel({
  meta,
  onAsk,
}: {
  meta: MessageMeta;
  /** When provided (interactive console), plan cards become tappable follow-ups. */
  onAsk?: (text: string) => void;
}) {
  if (meta.kind === "profile") {
    const { filled, missing } = meta.data;
    return (
      <Panel title="What I've got so far">
        <div className="flex flex-wrap gap-1.5">
          {filled.length === 0 && <span className="text-xs text-slate-400">Nothing yet</span>}
          {filled.map((f) => (
            <Badge key={f} tone="emerald">
              {f}
            </Badge>
          ))}
        </div>
        {missing.length > 0 && (
          <p className="mt-2 text-[11px] text-slate-400">Still asking about: {missing.join(", ")}</p>
        )}
      </Panel>
    );
  }

  if (meta.kind === "plans" || meta.kind === "whatif") {
    const { label, subsidyMonthly, topPlans } = meta.data;
    return (
      <Panel title={label}>
        <div className="space-y-2">
          {topPlans.map((p, i) => {
            const Tag = onAsk ? "button" : "div";
            return (
              <Tag
                key={p.name + i}
                {...(onAsk
                  ? {
                      type: "button" as const,
                      onClick: () => onAsk(`Be honest — is ${p.name} the right call for me, and why?`),
                      className:
                        "w-full text-left rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 transition-colors hover:border-emerald-300 hover:bg-emerald-50/60",
                    }
                  : { className: "rounded-xl border border-slate-100 bg-slate-50/70 p-2.5" })}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-slate-800">{p.name}</span>
                  <Badge tone={metalTone[p.metal] ?? "neutral"}>{p.metal}</Badge>
                </div>
                <div className="mt-1.5 flex items-end justify-between">
                  <div>
                    <div className="text-base font-semibold tabular-nums text-slate-900">{usd(p.expectedTotal)}</div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">expected / yr</div>
                  </div>
                  <div className="text-right text-[11px] text-slate-500">
                    <div>bad year {usd(p.p90)}</div>
                    <div>{p.probHitOOPMax}% hit OOP max</div>
                  </div>
                </div>
                {onAsk && <div className="mt-1.5 text-[10px] font-medium text-emerald-600">Tap to ask why →</div>}
              </Tag>
            );
          })}
        </div>
        {subsidyMonthly > 0 && (
          <p className="mt-2 text-[11px] text-emerald-700">Includes {usd(subsidyMonthly)}/mo subsidy.</p>
        )}
      </Panel>
    );
  }

  if (meta.kind === "marketplace") {
    const d = meta.data;
    return (
      <Panel title="Employer offer vs marketplace">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Your employer" value={d.employerOfferMonthly != null ? `${usd(d.employerOfferMonthly)}/mo` : "—"} />
          <Stat label="Best marketplace" value={`${usd(d.bestMarketplaceMonthly)}/mo`} highlight />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          {d.verdict} <span className="text-slate-400">({d.planCount} plans · {d.issuers} issuers in {d.state})</span>
        </p>
      </Panel>
    );
  }

  if (meta.kind === "hospital") {
    const d = meta.data;
    return (
      <Panel title={`${d.procedure} — ${d.state}`}>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Low" value={usd(d.min)} />
          <Stat label="Typical" value={usd(d.median)} highlight />
          <Stat label="High" value={usd(d.max)} />
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Your out-of-pocket before deductible, across plans.</p>
      </Panel>
    );
  }

  // outreach
  const d = meta.data;
  return (
    <Panel title={`Draft to ${d.target === "employer" ? "your employer" : "the hospital"}`}>
      <div className="rounded-xl border border-slate-100 bg-white p-2.5">
        <div className="text-xs font-medium text-slate-800">{d.subject}</div>
        <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-600">{d.body}</p>
      </div>
      <div className="mt-2">
        {d.sent ? (
          <Badge tone="emerald">Sent{d.to ? ` to ${d.to}` : ""}</Badge>
        ) : (
          <Badge tone="amber">Draft — awaiting your OK</Badge>
        )}
      </div>
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{title}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-2 py-1.5">
      <div className={`text-sm font-semibold tabular-nums ${highlight ? "text-emerald-700" : "text-slate-900"}`}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

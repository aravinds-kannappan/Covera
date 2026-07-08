"use client";
import { motion } from "motion/react";
import { AlertTriangle, TrendingUp, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// The intro that frames WHY choosing health insurance is a uniquely broken decision, before the
// demo shows Covera solving it. The core idea, made visual: you are asked to choose on a single
// number (the premium), but what actually bills you is a whole skewed distribution whose thin,
// far-right tail is the year that bankrupts people. Everything here is illustrative and labeled
// as such; the real numbers come from the simulation on the tabs.

// A right-skewed "cost of your year" distribution: a common typical year, a long thin tail.
const BARS = [
  0.05, 0.09, 0.16, 0.28, 0.44, 0.63, 0.83, 0.96, 1.0, 0.93, 0.82, 0.7, 0.58, 0.48, 0.39, 0.32,
  0.26, 0.21, 0.17, 0.14, 0.115, 0.095, 0.08, 0.067, 0.056, 0.047, 0.04, 0.034,
];
const TAIL_START = 18; // bars from here right are the bad-year tail (shaded rose)

const MARKERS = [
  { at: 2, label: "Premium", sub: "the floor you pay", tone: "slate" as const },
  { at: 11, label: "A typical year", sub: "what you expect", tone: "emerald" as const },
  { at: 22, label: "A bad year", sub: "what wrecks you", tone: "rose" as const },
];

const pct = (i: number) => ((i + 0.5) / BARS.length) * 100;

export function ProblemIntro() {
  return (
    <section className="relative overflow-hidden border-b border-slate-200 bg-white">
      <div className="bg-grid absolute inset-0 -z-10 opacity-50" aria-hidden />
      <div
        className="absolute inset-x-0 -top-24 -z-10 h-64 bg-gradient-to-b from-rose-100/40 to-transparent blur-2xl"
        aria-hidden
      />
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <Badge tone="rose">
            <AlertTriangle className="h-3.5 w-3.5" /> The one decision nobody helps you make
          </Badge>
          <h2 className="mt-5 font-serif text-3xl font-medium tracking-tight text-slate-900 sm:text-4xl">
            You&apos;re asked to bet a year of your life on{" "}
            <span className="italic text-rose-600">one number</span>.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Health plans get sold on the premium: a single monthly figure. But the premium is not
            what bills you. What bills you is a whole year of care you can&apos;t predict, and its
            shape is brutally lopsided. The cheapest premium and the right plan are rarely the same
            plan.
          </p>
        </div>

        {/* The distribution */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
          className="mx-auto mt-14 max-w-3xl"
        >
          <div className="flex items-end justify-between gap-2 text-sm">
            <span className="font-medium text-slate-500">What you pick on:</span>
            <span className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white tabular-nums">
              Premium: ~$3,000 / yr
            </span>
          </div>

          {/* histogram */}
          <div className="relative mt-3">
            <div className="flex h-52 items-end gap-[3px] border-b border-slate-300">
              {BARS.map((h, i) => (
                <motion.div
                  key={i}
                  initial={{ scaleY: 0 }}
                  whileInView={{ scaleY: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.15 + i * 0.02, ease: "easeOut" }}
                  style={{ height: `${h * 100}%`, transformOrigin: "bottom" }}
                  className={`flex-1 rounded-t-sm ${
                    i >= TAIL_START
                      ? "bg-gradient-to-t from-rose-400 to-rose-500"
                      : "bg-gradient-to-t from-indigo-300 to-indigo-500"
                  }`}
                />
              ))}
            </div>

            {/* markers */}
            {MARKERS.map((m) => (
              <div
                key={m.label}
                className="absolute top-0 flex h-full flex-col items-center"
                style={{ left: `${pct(m.at)}%`, transform: "translateX(-50%)" }}
              >
                <div
                  className={`h-full border-l border-dashed ${
                    m.tone === "rose"
                      ? "border-rose-400"
                      : m.tone === "emerald"
                        ? "border-indigo-500"
                        : "border-slate-400"
                  }`}
                />
              </div>
            ))}
          </div>

          {/* marker labels */}
          <div className="relative mt-2 h-12">
            {MARKERS.map((m) => (
              <motion.div
                key={m.label}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.7, duration: 0.4 }}
                className="absolute top-0 w-28 text-center"
                style={{ left: `${pct(m.at)}%`, transform: "translateX(-50%)" }}
              >
                <p
                  className={`text-xs font-semibold ${
                    m.tone === "rose" ? "text-rose-600" : m.tone === "emerald" ? "text-indigo-700" : "text-slate-600"
                  }`}
                >
                  {m.label}
                </p>
                <p className="text-[11px] leading-tight text-slate-400">{m.sub}</p>
              </motion.div>
            ))}
          </div>

          <p className="mt-3 text-center text-xs text-slate-400">
            Illustrative shape of your all-in annual cost (premium + out-of-pocket). The tab
            simulations produce the real numbers for your situation.
          </p>
        </motion.div>

        {/* Three reasons it's uniquely broken */}
        <div className="mx-auto mt-16 grid max-w-4xl gap-6 sm:grid-cols-3">
          {[
            {
              icon: TrendingUp,
              title: "The tail is the point",
              body: "Healthcare spending is wildly skewed: the top 5% of people drive about half of all spending. A single average hides the year that actually bankrupts you.",
            },
            {
              icon: Users,
              title: "You're handed two options",
              body: "Your employer picks a plan or two and calls it a choice, or you're alone in a marketplace of hundreds. Neither one is modeled against your real risk.",
            },
            {
              icon: AlertTriangle,
              title: "Nobody simulates you",
              body: "No one runs your drugs, your doctors, and thousands of possible years through each plan's real rules. So you guess on premium, and hope.",
            },
          ].map((c) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.4 }}
              className="rounded-2xl border border-slate-200 bg-white/70 p-5 shadow-sm"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-50 text-rose-600">
                <c.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-3 text-base font-semibold text-slate-900">{c.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{c.body}</p>
            </motion.div>
          ))}
        </div>

        <p className="mx-auto mt-14 max-w-2xl text-center text-lg font-medium text-slate-700">
          So Covera does the part no one else will: it simulates your real risk against every real
          plan, and you just{" "}
          <span className="text-indigo-700">talk to it</span> or{" "}
          <span className="text-indigo-700">text it</span>.
        </p>
      </div>
    </section>
  );
}

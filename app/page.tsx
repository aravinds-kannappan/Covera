import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Building2,
  CreditCard,
  LineChart,
  Mic,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <TrustBand />
        <Problem />
        <Lenses />
        <HowItWorks />
        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-slate-200">
      <div className="bg-grid absolute inset-0 -z-10 opacity-70" />
      <div
        className="absolute inset-x-0 -top-40 -z-10 h-80 bg-gradient-to-b from-emerald-100/60 to-transparent blur-2xl"
        aria-hidden
      />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
        <div className="animate-fade-up">
          <Badge tone="emerald">
            <Sparkles className="h-3.5 w-3.5" /> Real federal data · no guesswork
          </Badge>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Know what your care will{" "}
            <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
              actually cost
            </span>{" "}
            — before you choose.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
            The premium is the smallest part of the story. Covera simulates
            thousands of possible years of your health against every real plan,
            then ranks them by what you&apos;d truly pay — and the risk you carry.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/patient" className={buttonVariants({ size: "lg" })}>
              Find my plan <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/#how"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              How it works
            </Link>
          </div>
          <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
            <Mic className="h-4 w-4 text-emerald-600" />
            Or just talk — describe your health out loud and we build your profile.
          </div>
        </div>

        <div className="animate-fade-up [animation-delay:120ms]">
          <HeroVisual />
        </div>
      </div>
    </section>
  );
}

/** Decorative, illustrative visual of an annual-cost distribution. */
function HeroVisual() {
  return (
    <div className="relative rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Your year, simulated</p>
          <p className="text-lg font-semibold text-slate-900">
            All-in cost distribution
          </p>
        </div>
        <Badge tone="emerald">
          <TrendingDown className="h-3.5 w-3.5" /> Risk-adjusted
        </Badge>
      </div>

      <DistributionCurve />

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        {[
          { k: "Typical year", v: "lower", tone: "text-emerald-600" },
          { k: "Expected", v: "·", tone: "text-slate-900" },
          { k: "Bad year", v: "higher", tone: "text-rose-600" },
        ].map((c) => (
          <div
            key={c.k}
            className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-3"
          >
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              {c.k}
            </p>
            <p className={cn("mt-0.5 text-sm font-semibold", c.tone)}>{c.v}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-400">
        Illustrative. Real results are computed from your inputs and public CMS
        &amp; MEPS data, with every number traceable to its source.
      </p>
    </div>
  );
}

function DistributionCurve() {
  // A smooth, right-skewed density curve drawn as an SVG area.
  return (
    <svg
      viewBox="0 0 360 150"
      className="mt-5 h-40 w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="dist" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* P10–P90 shaded band */}
      <rect x="70" y="0" width="180" height="130" fill="#10b981" opacity="0.06" />
      {/* density curve */}
      <path
        d="M0,130 C60,128 80,40 130,30 C170,22 180,70 220,92 C270,118 320,126 360,129 L360,130 Z"
        fill="url(#dist)"
        stroke="#10b981"
        strokeWidth="2"
      />
      {/* expected marker */}
      <line x1="130" y1="20" x2="130" y2="130" stroke="#0f172a" strokeWidth="1.5" strokeDasharray="3 3" />
      {/* baseline */}
      <line x1="0" y1="130" x2="360" y2="130" stroke="#e2e8f0" strokeWidth="1" />
    </svg>
  );
}

function TrustBand() {
  const items = [
    "CMS Marketplace Public Use Files",
    "AHRQ MEPS expenditure data",
    "Hospital price transparency",
  ];
  return (
    <section className="border-b border-slate-200 bg-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-6 sm:flex-row sm:justify-between sm:px-6">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
          Every figure traces to public data
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {items.map((i) => (
            <span
              key={i}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-600"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              {i}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Problem() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
            The sticker price is the wrong number.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            People pick plans on the monthly premium — the one number that says
            nothing about what a real year of health will cost. Deductibles,
            coinsurance, drug tiers, and out-of-pocket caps decide the bill, and
            they interact in ways no human compares by hand.
          </p>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Covera does the actuarial math the insurer won&apos;t do for you —
            for <span className="font-semibold text-slate-900">your</span> body,
            your prescriptions, your doctors.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            {
              icon: LineChart,
              title: "A distribution, not a guess",
              body: "We simulate thousands of possible years to show your typical, expected, and worst-case spend.",
            },
            {
              icon: Wallet,
              title: "Total cost, not premium",
              body: "Premium + every out-of-pocket dollar under each plan's real cost-sharing rules.",
            },
            {
              icon: ShieldCheck,
              title: "Risk you can see",
              body: "The odds you hit your out-of-pocket max — and how much a bad year would hurt.",
            },
            {
              icon: Activity,
              title: "What drives your cost",
              body: "See which prescription or condition moves your bill the most, and by how much.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <f.icon className="h-6 w-6 text-emerald-600" />
              <h3 className="mt-3 text-sm font-semibold text-slate-900">
                {f.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Lenses() {
  const lenses = [
    {
      href: "/patient",
      icon: Stethoscope,
      tone: "emerald" as const,
      eyebrow: "For patients",
      title: "Find coverage that fits your life",
      body: "Describe your health by voice or form. Get plans ranked by risk-adjusted cost, ask anything, and carry a Coverage Card you own.",
      cta: "Start your match",
    },
    {
      href: "/employer",
      icon: Building2,
      tone: "sky" as const,
      eyebrow: "For employers",
      title: "Make every benefit dollar count",
      body: "Model an ICHRA contribution against real plans and your workforce. See coverage adequacy and the cost-minimizing amount.",
      cta: "Open the modeler",
    },
    {
      href: "/hospital",
      icon: ScanLine,
      tone: "violet" as const,
      eyebrow: "For hospitals",
      title: "Cost clarity at the front desk",
      body: "Scan a patient's Coverage Card to see coverage and real point-of-care cost — without ever pulling a record.",
      cta: "Try the card reader",
    },
  ];
  return (
    <section className="border-y border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
            One engine. Three people who all lose to coverage mismatch.
          </h2>
          <p className="mt-3 text-lg text-slate-600">
            Patients overpay, employers overspend, and hospitals eat the bad
            debt. Covera lines them up on the same real numbers.
          </p>
        </div>
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {lenses.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <span
                className={cn(
                  "grid h-11 w-11 place-items-center rounded-xl",
                  l.tone === "emerald" && "bg-emerald-50 text-emerald-600",
                  l.tone === "sky" && "bg-sky-50 text-sky-600",
                  l.tone === "violet" && "bg-violet-50 text-violet-600",
                )}
              >
                <l.icon className="h-6 w-6" />
              </span>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {l.eyebrow}
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">
                {l.title}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-500">
                {l.body}
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                {l.cta}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: Mic,
      title: "Tell us about you",
      body: "Speak or type your age, conditions, prescriptions, doctors, and what you expect this year. Your profile stays on your device.",
    },
    {
      icon: LineChart,
      title: "We simulate every plan",
      body: "A Monte-Carlo engine runs thousands of possible years through each real plan's cost-sharing rules, calibrated to MEPS data.",
    },
    {
      icon: CreditCard,
      title: "Choose, then carry it",
      body: "Pick with confidence, ask the assistant anything, and generate a Coverage Card you can hand any provider.",
    },
  ];
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <div className="max-w-2xl">
        <Badge tone="neutral">How it works</Badge>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
          From your story to the right plan — in minutes.
        </h2>
      </div>
      <div className="mt-12 grid gap-8 md:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="relative">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-sm font-semibold text-white">
                {i + 1}
              </span>
              <s.icon className="h-5 w-5 text-emerald-600" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">
              {s.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              {s.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 px-8 py-14 text-center shadow-lg">
        <div className="bg-grid absolute inset-0 opacity-10" aria-hidden />
        <h2 className="relative text-3xl font-semibold tracking-tight text-white">
          Stop guessing. Start knowing.
        </h2>
        <p className="relative mx-auto mt-3 max-w-xl text-emerald-50">
          Build your profile in a few minutes and see the coverage that
          actually fits — grounded in real data, owned by you.
        </p>
        <div className="relative mt-8">
          <Link
            href="/patient"
            className={buttonVariants({
              size: "lg",
              className: "bg-white text-emerald-700 hover:bg-emerald-50",
            })}
          >
            Find my plan <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

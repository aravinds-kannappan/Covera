import Link from "next/link";
import {
  ArrowRight,
  Building2,
  LineChart,
  MessageSquare,
  Mic,
  ScanLine,
  ShieldCheck,
  Stethoscope,
  Store,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ProblemIntro } from "@/components/story/problem-intro";
import { AgentNetwork } from "@/components/story/agent-network";
import { CapabilityShowcase } from "@/components/text/capability-showcase";
import { LiveConsole } from "@/components/text/live-console";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <ProblemIntro />
        <NetworkSection />
        <TrustBand />
        <CapabilitiesSection />
        <Lenses />
        <TextSection />
        <HowItWorks />
        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden border-b border-slate-200/70 scroll-mt-20">
      <div className="bg-grid absolute inset-0 -z-10 opacity-60" />
      <div
        className="absolute inset-x-0 -top-40 -z-10 h-80 bg-gradient-to-b from-indigo-100/50 to-transparent blur-2xl"
        aria-hidden
      />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
        <div className="animate-fade-up">
          <Badge tone="emerald">An insurance marketplace you talk to</Badge>
          <h1 className="mt-6 font-serif text-4xl font-medium leading-[1.1] tracking-tight text-slate-900 sm:text-6xl">
            The health plan marketplace you{" "}
            <span className="italic text-indigo-600">just talk to</span>.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
            Stuck with your employer&apos;s two options, or shopping on your own? Tell Covera your
            situation out loud, or by text. A team of agents searches the whole marketplace,
            simulates what you&apos;d truly pay, and reaches out to your employer or hospital once you
            choose.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/patient" className={buttonVariants({ size: "lg" })}>
              <Mic className="h-4 w-4" /> Talk to Covera
            </Link>
            <Link href="#how" className={buttonVariants({ variant: "outline", size: "lg" })}>
              See how it works
            </Link>
          </div>
          <p className="label-mono mt-6 text-[11px] text-slate-400">
            Real CMS data · Your risk, simulated · No sign-up
          </p>
        </div>

        <div className="animate-fade-up [animation-delay:120ms]">
          <HeroOrb />
        </div>
      </div>
    </section>
  );
}

// A calm, static voice card in the hero, echoing the real voice concierge on the patient tab.
function HeroOrb() {
  return (
    <div className="relative mx-auto w-full max-w-sm rounded-[2rem] border border-slate-200 bg-white/70 p-6 shadow-xl shadow-indigo-950/5 backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 font-serif text-base text-slate-900">
          Covera <span className="h-1 w-1 rounded-full bg-indigo-500" />
        </span>
        <span className="label-mono text-[10px] text-indigo-600">Speaking</span>
      </div>
      <div className="flex flex-col items-center py-8">
        <div className="relative grid place-items-center">
          <span className="animate-orb-pulse absolute h-40 w-40 rounded-full bg-indigo-400/20" />
          <span className="relative grid h-36 w-36 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-white">
            <Mic className="h-8 w-8" />
          </span>
        </div>
        <div className="mt-6 flex h-5 items-end gap-1" aria-hidden>
          {[0.5, 0.9, 0.6, 1, 0.7, 0.85, 0.55].map((b, i) => (
            <span key={i} className="w-1 rounded-full bg-indigo-400" style={{ height: `${b * 100}%` }} />
          ))}
        </div>
        <p className="label-mono mt-6 text-[10px] text-indigo-600">Advisor</p>
        <p className="mt-2 max-w-[16rem] text-center font-serif text-lg leading-snug text-slate-800">
          &ldquo;Gold caps your worst year at $8,550. It&apos;s the safe pick for you.&rdquo;
        </p>
      </div>
      <div className="label-mono flex items-center justify-center border-t border-slate-100 pt-4 text-[10px] text-slate-400">
        Your voice · Real public data
      </div>
    </div>
  );
}

function NetworkSection() {
  return (
    <section id="demo" className="relative scroll-mt-20 border-b border-slate-200/70">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <AgentNetwork />
      </div>
    </section>
  );
}

function TrustBand() {
  const items = [
    "CMS Marketplace Public Use Files",
    "AHRQ MEPS expenditure data",
    "CMS Medicare physician prices",
    "ACA subsidy (APTC) benchmark",
  ];
  return (
    <section className="border-b border-slate-200/70">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-7 sm:flex-row sm:justify-between sm:px-6">
        <p className="label-mono text-[11px] text-slate-400">Every figure traces to public data</p>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {items.map((i) => (
            <span key={i} className="flex items-center gap-1.5 text-sm text-slate-600">
              <ShieldCheck className="h-4 w-4 text-indigo-500" />
              {i}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function CapabilitiesSection() {
  return (
    <section id="capabilities" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <Badge tone="emerald">More than enrollment</Badge>
          <h2 className="mt-5 font-serif text-3xl font-medium tracking-tight text-slate-900 sm:text-4xl">
            It stays in your corner all year.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Picking a plan is the start. The same agents keep working for you every time health costs
            get confusing.
          </p>
        </div>
        <CapabilityShowcase />
      </div>
    </section>
  );
}

function TextSection() {
  return (
    <section className="border-y border-slate-200/70 bg-white/50">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <Badge tone="neutral">Prefer to type?</Badge>
          <h2 className="mt-5 font-serif text-3xl font-medium tracking-tight text-slate-900 sm:text-4xl">
            The same agents work by text, too.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Not in a place to talk? Message the exact same multi-agent system. Try it right here, no
            sign-up.
          </p>
        </div>
        <LiveConsole />
      </div>
    </section>
  );
}

function Lenses() {
  const lenses = [
    {
      href: "/patient",
      icon: Stethoscope,
      eyebrow: "For patients",
      title: "Shop, then never overpay again",
      body: "Plans ranked by risk-adjusted cost, a real estimate before any procedure, a bill auditor that catches overcharges, an appeal drafter for denials, and a Coverage Card you own.",
      cta: "Find your plan",
    },
    {
      href: "/employer",
      icon: Building2,
      eyebrow: "For employers",
      title: "Offer real choice",
      body: "Model an ICHRA contribution against real marketplace prices and your workforce, and let employees pick what actually fits them.",
      cta: "Open the modeler",
    },
    {
      href: "/hospital",
      icon: ScanLine,
      eyebrow: "For hospitals",
      title: "Cost clarity at the desk",
      body: "Scan a patient's Coverage Card to see coverage and real point-of-care cost, without ever pulling a record.",
      cta: "Try the card reader",
    },
  ];
  return (
    <section className="border-b border-slate-200/70">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="max-w-2xl">
          <Badge tone="emerald">One marketplace engine</Badge>
          <h2 className="mt-5 font-serif text-3xl font-medium tracking-tight text-slate-900 sm:text-4xl">
            Built for everyone the current system leaves guessing.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Patients overpay, employers overspend, and hospitals eat the bad debt. Covera lines them
            up on the same real numbers, and the agents connect them.
          </p>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {lenses.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                <l.icon className="h-6 w-6" />
              </span>
              <p className="label-mono mt-5 text-[10px] text-slate-400">{l.eyebrow}</p>
              <h3 className="mt-1.5 font-serif text-xl font-medium text-slate-900">{l.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-500">{l.body}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700">
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
      icon: MessageSquare,
      title: "Say your situation",
      body: "Age, state, income, conditions, meds: out loud or by text. An intake agent turns it into a structured profile. No forms.",
    },
    {
      icon: LineChart,
      title: "Agents do the shopping",
      body: "Covera ranks every real plan in real time, then simulates your bad-year tail so the cheapest plan isn't mistaken for the right one, and compares it to your employer offer.",
    },
    {
      icon: Store,
      title: "Choose: it acts for you",
      body: "Pick a plan. Covera drafts and sends outreach to your employer or hospital, and hands you a Coverage Card you own.",
    },
    {
      icon: ShieldCheck,
      title: "Then it stays all year",
      body: "Get your real cost before a procedure, forward a bill to catch overcharges, draft an appeal for a denial, and re-check at every open enrollment.",
    },
  ];
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
      <div className="max-w-2xl">
        <Badge tone="neutral">How it works</Badge>
        <h2 className="mt-5 font-serif text-3xl font-medium tracking-tight text-slate-900 sm:text-4xl">
          From a sentence to the right plan, and beyond.
        </h2>
      </div>
      <div className="mt-14 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <div key={s.title} className="relative">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 font-serif text-sm text-white">
                {i + 1}
              </span>
              <s.icon className="h-5 w-5 text-indigo-500" />
            </div>
            <h3 className="mt-4 font-serif text-lg font-medium text-slate-900">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-indigo-800 px-8 py-16 text-center shadow-lg">
        <div className="bg-grid absolute inset-0 opacity-10" aria-hidden />
        <h2 className="relative font-serif text-3xl font-medium tracking-tight text-white sm:text-4xl">
          Find a better deal than the one you were handed.
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-indigo-100">
          Talk to Covera, or build your profile on the web. Either way you get the whole marketplace,
          grounded in real data, working for you.
        </p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/patient"
            className={buttonVariants({ size: "lg", className: "bg-white text-indigo-700 hover:bg-indigo-50" })}
          >
            <Mic className="h-4 w-4" /> Talk to Covera <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

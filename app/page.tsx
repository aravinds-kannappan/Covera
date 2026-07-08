import Link from "next/link";
import {
  ArrowRight,
  Building2,
  LineChart,
  MessageSquare,
  PlayCircle,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Store,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PhoneFrame } from "@/components/text/phone-frame";
import { ScrollStory } from "@/components/text/scroll-story";
import { ProblemIntro } from "@/components/story/problem-intro";
import { DualChannelDemo } from "@/components/story/dual-channel-demo";
import { CapabilityShowcase } from "@/components/text/capability-showcase";
import { LiveConsole } from "@/components/text/live-console";
import { EnrollForm } from "@/components/text/enroll-form";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <ProblemIntro />
        <ScrollStory />
        <DemoSection />
        <TrustBand />
        <CapabilitiesSection />
        <LiveSection />
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
    <section id="top" className="relative overflow-hidden border-b border-slate-200 scroll-mt-20">
      <div className="bg-grid absolute inset-0 -z-10 opacity-70" />
      <div
        className="absolute inset-x-0 -top-40 -z-10 h-80 bg-gradient-to-b from-emerald-100/60 to-transparent blur-2xl"
        aria-hidden
      />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
        <div className="animate-fade-up">
          <Badge tone="emerald">
            <Sparkles className="h-3.5 w-3.5" /> An insurance marketplace you text or talk to
          </Badge>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            The health plan marketplace that{" "}
            <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
              texts you the right plan
            </span>
            .
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
            Stuck with your employer&apos;s two options, or shopping on your own? Text Covera your
            situation, or just talk to it. It searches the entire marketplace, simulates what
            you&apos;d truly pay, answers any what-if, and can even reach out to your employer or
            hospital once you choose.
          </p>
          <div className="mt-7">
            <EnrollForm />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href="#demo"
              className={buttonVariants({ variant: "outline", className: "group" })}
            >
              <PlayCircle className="h-4 w-4 text-emerald-600" />
              Watch the 60-second demo
            </Link>
            <span className="text-xs text-slate-400">No sign-up. Plays itself.</span>
          </div>
          <div className="mt-5 flex items-center gap-2 text-sm text-slate-500">
            <MessageSquare className="h-4 w-4 text-emerald-600" />
            iMessage for now (blue bubbles). Prefer the web, or want to talk it through? The full optimizer and voice concierge live under{" "}
            <Link href="/patient" className="font-medium text-emerald-700 underline-offset-2 hover:underline">
              For patients
            </Link>
            .
          </div>
        </div>

        <div className="animate-fade-up [animation-delay:120ms]">
          <PhoneFrame>
            <div className="space-y-3 bg-slate-50/60 px-3 py-4">
              <TeaserBubble agent>Hi, I&apos;m Covera 👋 What&apos;s your situation?</TeaserBubble>
              <TeaserBubble>34, Texas, $48k, type 2 diabetes.</TeaserBubble>
              <TeaserBubble agent>
                Your employer plan is $420/mo, but you qualify for a subsidy. The best marketplace
                plan is ~$246/mo. Want the top 3?
              </TeaserBubble>
            </div>
            <div className="flex items-center gap-2 border-t border-slate-100 bg-white p-2.5">
              <div className="h-8 flex-1 rounded-full bg-slate-100" />
              <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white">
                <ArrowRight className="h-4 w-4" />
              </div>
            </div>
          </PhoneFrame>
        </div>
      </div>
    </section>
  );
}

function TeaserBubble({ agent, children }: { agent?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex", agent ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-snug shadow-sm",
          agent
            ? "rounded-bl-md bg-gradient-to-br from-sky-500 to-blue-600 text-white"
            : "rounded-br-md bg-slate-100 text-slate-800",
        )}
      >
        {children}
      </div>
    </div>
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
    <section className="border-y border-slate-200 bg-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-6 sm:flex-row sm:justify-between sm:px-6">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
          Every figure traces to public data
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {items.map((i) => (
            <span key={i} className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              {i}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoSection() {
  return (
    <section
      id="demo"
      className="relative scroll-mt-20 overflow-hidden border-y border-slate-200 bg-slate-50"
    >
      <div
        className="absolute inset-x-0 -top-24 -z-10 h-64 bg-gradient-to-b from-emerald-100/50 to-transparent blur-2xl"
        aria-hidden
      />
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <Badge tone="emerald">
            <PlayCircle className="h-3.5 w-3.5" /> The 60-second demo
          </Badge>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
            Press play. Watch the agents do the whole thing.
          </h2>
          <p className="mt-3 text-lg text-slate-600">
            The same real conversation on both channels at once: intake, the whole-marketplace
            comparison, a Monte-Carlo simulation, a what-if, and choosing a plan. Watch the
            specialist agents hand off as it moves, by text and by voice.
          </p>
        </div>
        <DualChannelDemo />
      </div>
    </section>
  );
}

function CapabilitiesSection() {
  return (
    <section id="capabilities" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <Badge tone="sky">
            <MessageSquare className="h-3.5 w-3.5" /> More than enrollment
          </Badge>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
            It stays in your corner all year.
          </h2>
          <p className="mt-3 text-lg text-slate-600">
            Picking a plan is the start. The same text thread keeps working for you every time
            health costs get confusing.
          </p>
        </div>
        <CapabilityShowcase />
      </div>
    </section>
  );
}

function LiveSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <LiveConsole />
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
      title: "Shop, then never overpay again",
      body: "Plans ranked by risk-adjusted cost, a real estimate before any procedure, a bill auditor that catches overcharges, an appeal drafter for denials, and a Coverage Card you own.",
      cta: "Find your plan",
    },
    {
      href: "/employer",
      icon: Building2,
      tone: "sky" as const,
      eyebrow: "For employers",
      title: "Offer real choice",
      body: "Model an ICHRA contribution against real marketplace prices and your workforce, and let employees pick what actually fits them.",
      cta: "Open the modeler",
    },
    {
      href: "/hospital",
      icon: ScanLine,
      tone: "violet" as const,
      eyebrow: "For hospitals",
      title: "Cost clarity at the desk",
      body: "Scan a patient's Coverage Card to see coverage and real point-of-care cost, without ever pulling a record.",
      cta: "Try the card reader",
    },
  ];
  return (
    <section className="border-y border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <Badge tone="emerald">
            <Store className="h-3.5 w-3.5" /> One marketplace engine
          </Badge>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
            Built for everyone the current system leaves guessing.
          </h2>
          <p className="mt-3 text-lg text-slate-600">
            Patients overpay, employers overspend, and hospitals eat the bad debt. Covera lines them
            up on the same real numbers, and the agent connects them.
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
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{l.eyebrow}</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">{l.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-500">{l.body}</p>
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
      icon: MessageSquare,
      title: "Text your situation",
      body: "Age, state, income, conditions, meds: in plain language. An intake agent turns it into a structured profile. No forms.",
    },
    {
      icon: LineChart,
      title: "Agents do the shopping",
      body: "Covera ranks every real plan in real time, then simulates your bad-year tail so the cheapest plan isn't mistaken for the right one, and compares it to your employer offer.",
    },
    {
      icon: Store,
      title: "Choose: it acts for you",
      body: "Pick a plan by text. Covera drafts and sends outreach to your employer or hospital, and hands you a Coverage Card you own.",
    },
    {
      icon: ShieldCheck,
      title: "Then it stays all year",
      body: "Get your real cost before a procedure, forward a bill to catch overcharges, draft an appeal for a denial, and re-check at every open enrollment.",
    },
  ];
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <div className="max-w-2xl">
        <Badge tone="neutral">How it works</Badge>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
          From a text to the right plan, and beyond.
        </h2>
      </div>
      <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <div key={s.title} className="relative">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-sm font-semibold text-white">
                {i + 1}
              </span>
              <s.icon className="h-5 w-5 text-emerald-600" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">{s.title}</h3>
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
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 px-8 py-14 text-center shadow-lg">
        <div className="bg-grid absolute inset-0 opacity-10" aria-hidden />
        <h2 className="relative text-3xl font-semibold tracking-tight text-white">
          Find a better deal than the one you were handed.
        </h2>
        <p className="relative mx-auto mt-3 max-w-xl text-emerald-50">
          Text Covera, or build your profile on the web. Either way you get the whole marketplace,
          grounded in real data, working for you.
        </p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/patient"
            className={buttonVariants({ size: "lg", className: "bg-white text-emerald-700 hover:bg-emerald-50" })}
          >
            Open the optimizer <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

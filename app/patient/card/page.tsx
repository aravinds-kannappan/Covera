"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  ScanLine,
} from "lucide-react";
import { useCovera } from "@/lib/store";
import { buildCard, encodeCard } from "@/lib/card";
import { SiteHeader } from "@/components/site-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { CoverageCardVisual } from "@/components/coverage-card";

export default function CardPage() {
  const profile = useCovera((s) => s.profile);
  const result = useCovera((s) => s.result);
  const selectedPlanId = useCovera((s) => s.selectedPlanId);
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => setMounted(true), []);

  const ranked =
    result?.ranked.find((r) => r.plan.id === selectedPlanId) ?? result?.ranked[0];

  const card = useMemo(
    () =>
      profile && ranked
        ? buildCard(profile, ranked.plan, ranked.sim.annualPremium / 12, name)
        : null,
    [profile, ranked, name],
  );

  const link = useMemo(() => {
    if (!card || typeof window === "undefined") return "";
    return `${window.location.origin}/card/view#${encodeCard(card)}`;
  }, [card]);

  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then(setQr)
      .catch(() => setQr(null));
  }, [link]);

  if (!mounted) return <Shell />;
  if (!profile || !card) {
    return (
      <Shell>
        <div className="mx-auto max-w-md py-20 text-center">
          <p className="text-slate-600">Run your match first to build a card.</p>
          <Link href="/patient" className={buttonVariants({ className: "mt-4" })}>
            Find my plan
          </Link>
        </div>
      </Shell>
    );
  }

  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(card, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "covera-coverage-card.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Shell>
      <Link
        href="/patient/results"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to results
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
        Your Coverage Card
      </h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        A card you own and carry. Hand it to any provider — they see your coverage
        and what a visit will cost,{" "}
        <span className="font-medium text-slate-900">without ever pulling your records</span>.
        Everything lives in the link itself; nothing is stored on a server.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div>
          <div className="mb-4 max-w-xs">
            <TextInput
              placeholder="Name on card (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <CoverageCardVisual card={card} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <ScanLine className="h-5 w-5 text-emerald-600" /> Share at the front desk
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Let a provider scan this code to open your read-only card.
          </p>
          <div className="mt-5 flex flex-col items-center gap-4 rounded-2xl bg-slate-50 p-5">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="Coverage Card QR code" className="h-56 w-56 rounded-xl" />
            ) : (
              <div className="h-56 w-56 animate-pulse rounded-xl bg-slate-200" />
            )}
            <div className="flex w-full flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={copyLink} className="flex-1">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy link"}
              </Button>
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline", size: "sm", className: "flex-1" })}
              >
                <ExternalLink className="h-4 w-4" /> Open card
              </a>
              <Button variant="ghost" size="sm" onClick={downloadJSON} className="flex-1">
                <Download className="h-4 w-4" /> Export JSON
              </Button>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 p-4 text-sm">
            <p className="font-medium text-slate-900">What a provider sees</p>
            <ul className="mt-2 space-y-1.5 text-slate-500">
              <li>• Your plan, deductible, and out-of-pocket max</li>
              <li>• A live cost estimate for any procedure they choose</li>
              <li>• Your medications and their coverage tier</li>
              <li>• Nothing from your medical records — you control the card</li>
            </ul>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">{children}</main>
    </>
  );
}

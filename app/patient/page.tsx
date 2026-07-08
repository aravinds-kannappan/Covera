import { ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PatientExperience } from "@/components/patient/patient-experience";
import { Badge } from "@/components/ui/badge";

export default function PatientPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="mb-8">
          <Badge tone="emerald">
            <ShieldCheck className="h-3.5 w-3.5" /> Your data stays in your browser
          </Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Let&apos;s find your best coverage.
          </h1>
          <p className="mt-3 text-lg text-slate-600">
            Tell us about your health and money, by form or just by talking. We&apos;ll simulate
            thousands of possible years against every real plan in your state and rank them by
            what you&apos;d truly pay.
          </p>
        </div>
        <PatientExperience />
      </main>
      <SiteFooter />
    </>
  );
}

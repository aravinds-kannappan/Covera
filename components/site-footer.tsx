import { Logo } from "@/components/brand";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row">
          <div className="max-w-sm">
            <Logo href={null} />
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              Covera puts the math behind your coverage in your hands. Every
              figure traces to public federal data: no guesswork, no fine
              print left unread.
            </p>
          </div>
          <div className="text-sm">
            <p className="font-medium text-slate-900">Grounded in real data</p>
            <ul className="mt-3 space-y-1.5 text-slate-500">
              <li>CMS Health Insurance Exchange Public Use Files</li>
              <li>AHRQ Medical Expenditure Panel Survey (MEPS)</li>
              <li>Hospital price transparency disclosures</li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-slate-200 pt-6 text-xs text-slate-400">
          Covera is a decision-support tool, not insurance advice. Estimates are
          modeled from public data and your inputs; confirm details with the
          plan issuer before enrolling.
        </div>
      </div>
    </footer>
  );
}

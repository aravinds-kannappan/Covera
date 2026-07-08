import { Logo } from "@/components/brand";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200/70">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-8 sm:flex-row">
          <div className="max-w-sm">
            <Logo href={null} />
            <p className="mt-4 text-sm leading-relaxed text-slate-500">
              Covera puts the math behind your coverage in your hands. Every figure traces to public
              federal data: no guesswork, no fine print left unread.
            </p>
          </div>
          <div>
            <p className="label-mono text-[11px] text-slate-400">Grounded in real data</p>
            <ul className="mt-3 space-y-1.5 text-sm text-slate-500">
              <li>CMS Health Insurance Exchange Public Use Files</li>
              <li>AHRQ Medical Expenditure Panel Survey (MEPS)</li>
              <li>CMS Medicare physician prices</li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-slate-200/70 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="label-mono text-[10px] text-slate-400">
            Your voice · Your risk, simulated · Decision support, not insurance advice
          </p>
          <p className="text-xs text-slate-400">Confirm details with the plan issuer before enrolling.</p>
        </div>
      </div>
    </footer>
  );
}

import Link from "next/link";
import { Logo } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";

const NAV = [
  { href: "/#how", label: "Marketplace" },
  { href: "/patient", label: "Patients" },
  { href: "/employer", label: "Employers" },
  { href: "/hospital", label: "Hospitals" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link href="/#top" className={buttonVariants({ size: "sm" })}>
          Text the agent
        </Link>
      </div>
    </header>
  );
}

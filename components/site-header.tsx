import Link from "next/link";
import { Logo } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";

const NAV = [
  { href: "/patient", label: "For patients" },
  { href: "/employer", label: "For employers" },
  { href: "/hospital", label: "For hospitals" },
  { href: "/#how", label: "How it works" },
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
        <Link href="/patient" className={buttonVariants({ size: "sm" })}>
          Find my plan
        </Link>
      </div>
    </header>
  );
}

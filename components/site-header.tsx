"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/#how", label: "Marketplace", match: "/" },
  { href: "/patient", label: "Patients", match: "/patient" },
  { href: "/employer", label: "Employers", match: "/employer" },
  { href: "/hospital", label: "Hospitals", match: "/hospital" },
  { href: "/benchmark", label: "Benchmarks", match: "/benchmark" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-[var(--background)]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active =
              item.match === "/"
                ? pathname === "/"
                : pathname === item.match || pathname.startsWith(item.match + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "label-mono rounded-full px-3 py-1.5 text-[11px] transition-colors",
                  active ? "text-indigo-700" : "text-slate-500 hover:text-slate-900",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/patient"
          className="label-mono rounded-full border border-slate-300 px-4 py-1.5 text-[11px] text-slate-700 transition-colors hover:border-indigo-400 hover:text-indigo-700"
        >
          Talk to Covera
        </Link>
      </div>
    </header>
  );
}

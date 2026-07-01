"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
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
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
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
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/#top" className={buttonVariants({ size: "sm" })}>
          Text the agent
        </Link>
      </div>
    </header>
  );
}

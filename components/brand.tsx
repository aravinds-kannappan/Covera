import Link from "next/link";
import { cn } from "@/lib/utils";

/** Covera wordmark: a calm serif word with a single indigo dot, its steady "signal". */
export function Logo({
  className,
  href = "/",
}: {
  className?: string;
  href?: string | null;
}) {
  const inner = (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="font-serif text-[20px] font-semibold tracking-tight text-slate-900">
        Covera
      </span>
      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" aria-hidden />
    </span>
  );
  if (href === null) return inner;
  return (
    <Link href={href} className="shrink-0">
      {inner}
    </Link>
  );
}

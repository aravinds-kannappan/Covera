import Link from "next/link";
import { cn } from "@/lib/utils";

/** Covera wordmark + glyph. The glyph is a stylized "shield + pulse". */
export function Logo({
  className,
  href = "/",
}: {
  className?: string;
  href?: string | null;
}) {
  const inner = (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="relative grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none">
          <path
            d="M12 3l7 3v5c0 4.2-2.8 7.6-7 9-4.2-1.4-7-4.8-7-9V6l7-3z"
            fill="currentColor"
            fillOpacity="0.22"
          />
          <path
            d="M5 12.5h3l1.5-3.5 2.5 6 1.6-3.4H19"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="text-[17px] font-semibold tracking-tight text-slate-900">
        Covera
      </span>
    </span>
  );
  if (href === null) return inner;
  return (
    <Link href={href} className="shrink-0">
      {inner}
    </Link>
  );
}

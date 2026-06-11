"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

const inputBase =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 " +
  "shadow-sm transition-colors placeholder:text-slate-400 focus:border-emerald-500 " +
  "focus:outline-none focus:ring-2 focus:ring-emerald-500/30";

export const TextInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(inputBase, className)} {...props} />
));
TextInput.displayName = "TextInput";

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputBase, "appearance-none pr-9", className)} {...props}>
      {children}
    </select>
  );
}

export function Chip({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all",
        active
          ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm"
          : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50",
        className,
      )}
      {...props}
    />
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            "rounded-xl border px-3 py-2.5 text-center transition-all",
            value === o.key
              ? "border-emerald-500 bg-emerald-50 shadow-sm"
              : "border-slate-300 bg-white hover:border-slate-400",
          )}
        >
          <span
            className={cn(
              "block text-sm font-semibold",
              value === o.key ? "text-emerald-700" : "text-slate-700",
            )}
          >
            {o.label}
          </span>
          {o.hint && (
            <span className="mt-0.5 block text-[11px] leading-tight text-slate-400">
              {o.hint}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-left"
    >
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span
        className={cn(
          "relative h-6 w-11 rounded-full transition-colors",
          checked ? "bg-emerald-500" : "bg-slate-300",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

"use client";
import { useState } from "react";
import { FileText, Mic } from "lucide-react";
import { IntakeForm } from "@/components/patient/intake-form";
import { VoiceConcierge } from "@/components/patient/voice-concierge";
import { cn } from "@/lib/utils";

// The patient tab offers two ways in: a fast structured form, or a spoken conversation for people
// who have more to say and want to talk it through. Both feed the same real simulation.
export function PatientExperience() {
  const [mode, setMode] = useState<"form" | "voice">("form");
  return (
    <div>
      <div className="mb-8 inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
        <ModeTab active={mode === "form"} onClick={() => setMode("form")} icon={FileText} label="Quick form" />
        <ModeTab active={mode === "voice"} onClick={() => setMode("voice")} icon={Mic} label="Talk it through" />
      </div>
      {mode === "form" ? <IntakeForm /> : <VoiceConcierge />}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof FileText;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

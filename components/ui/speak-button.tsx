"use client";
import { useState } from "react";
import { Loader2, Volume2, VolumeX } from "lucide-react";
import { usePlayer } from "@/lib/voice/client";
import { cn } from "@/lib/utils";

// A small "read this aloud" control for dense results (a plan recommendation, a cost waterfall, a
// bill-audit summary). Insurance math is hard to read; hearing it with natural pacing is easier.
// It calls /api/voice/speak (a $0.08 ElevenLabs call, only on click) and falls back to the
// browser's built-in speech when cloud voice is not configured, so it always does something.
export function SpeakButton({
  text,
  metaKind,
  persona,
  label,
  className,
}: {
  text: string;
  metaKind?: string;
  persona?: string;
  label?: string;
  className?: string;
}) {
  const player = usePlayer();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (player.playing) {
      player.stop();
      return;
    }
    const clean = text.trim();
    if (!clean) return;
    setLoading(true);
    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: clean, metaKind, persona }),
      });
      const data = await res.json().catch(() => null);
      if (data && data.source === "elevenlabs" && data.audioBase64) {
        void player.play(data.audioBase64, data.mime, clean);
      } else {
        void player.play("", "", clean); // browser-speech fallback
      }
    } catch {
      void player.play("", "", clean);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={player.playing ? "Stop" : label ?? "Listen"}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700",
        className,
      )}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : player.playing ? (
        <VolumeX className="h-3.5 w-3.5" />
      ) : (
        <Volume2 className="h-3.5 w-3.5" />
      )}
      {label && <span>{label}</span>}
    </button>
  );
}

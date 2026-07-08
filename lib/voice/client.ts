"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Client-side voice helpers for the voice concierge. Recording captures a short clip with
// MediaRecorder and hands back base64 for the ElevenLabs STT route; playback plays the base64
// MP3 the TTS route returns, and falls back to the browser's built-in speech when voice is not
// configured (source "unconfigured") or audio playback fails. Nothing here bills: the paid calls
// happen server-side only when the user records or the reply is spoken.

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return "";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const s = String(reader.result ?? "");
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export interface RecordedClip {
  base64: string;
  mime: string;
}

function recorderSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

/** Push-to-talk recorder. start() begins capture; stop() resolves with the clip (or null). */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  // Optimistic: assume a mic until a start() actually fails or the API is missing, which avoids
  // setting state inside an effect (and a hydration flip).
  const [supported, setSupported] = useState(true);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const resolveRef = useRef<((v: RecordedClip | null) => void) | null>(null);

  const start = useCallback(async () => {
    if (!recorderSupported()) {
      setSupported(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        stream.getTracks().forEach((t) => t.stop());
        blobToBase64(blob)
          .then((base64) => resolveRef.current?.({ base64, mime: type }))
          .catch(() => resolveRef.current?.(null))
          .finally(() => {
            resolveRef.current = null;
          });
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setSupported(false);
      setRecording(false);
    }
  }, []);

  const stop = useCallback((): Promise<RecordedClip | null> => {
    return new Promise((resolve) => {
      const rec = recRef.current;
      if (!rec || rec.state === "inactive") {
        resolve(null);
        return;
      }
      resolveRef.current = resolve;
      rec.stop();
      setRecording(false);
    });
  }, []);

  return { recording, supported, start, stop };
}

function speakBrowser(text: string, onEnd?: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.02;
  if (onEnd) u.onend = onEnd;
  window.speechSynthesis.speak(u);
}

/** Plays TTS audio, with a browser-speech fallback so the concierge still talks with no key. */
export function usePlayer() {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    setPlaying(false);
  }, []);

  const play = useCallback(
    async (audioBase64: string, mime: string, fallbackText?: string) => {
      stop();
      if (audioBase64) {
        try {
          const audio = new Audio(`data:${mime || "audio/mpeg"};base64,${audioBase64}`);
          audioRef.current = audio;
          audio.onended = () => setPlaying(false);
          audio.onerror = () => {
            setPlaying(false);
            if (fallbackText) speakBrowser(fallbackText, () => setPlaying(false));
          };
          setPlaying(true);
          await audio.play();
          return;
        } catch {
          /* fall through to browser speech */
        }
      }
      if (fallbackText) {
        setPlaying(true);
        speakBrowser(fallbackText, () => setPlaying(false));
      }
    },
    [stop],
  );

  useEffect(() => () => stop(), [stop]);
  return { playing, play, stop };
}

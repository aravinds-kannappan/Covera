"use client";
import { useRef, useState, useEffect } from "react";
import { motion, useScroll, useMotionValueEvent, AnimatePresence } from "motion/react";
import { DEMO_SCRIPT, type ScriptStep } from "@/lib/demo/script";
import { PhoneFrame } from "@/components/text/phone-frame";
import { MessageBubble } from "@/components/text/message-bubble";

// The scroll-driven centerpiece. The phone is pinned while you scroll; messages reveal
// one by one and feature panels pop in, with a narrative caption that tracks the story.
export function ScrollStory({ steps = DEMO_SCRIPT }: { steps?: ScriptStep[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(1);

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const count = Math.min(steps.length, Math.max(1, Math.ceil(p * (steps.length + 0.5))));
    setRevealed(count);
  });

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [revealed]);

  // The most recent caption at or before the latest revealed step.
  let caption: ScriptStep["caption"];
  for (let i = revealed - 1; i >= 0; i--) {
    if (steps[i]?.caption) {
      caption = steps[i].caption;
      break;
    }
  }

  const visible = steps.slice(0, revealed).map((s) => s.message);

  return (
    <section ref={trackRef} className="relative" style={{ height: `${steps.length * 60}vh` }}>
      <div className="sticky top-0 flex min-h-screen items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
          {/* Narrative side */}
          <div className="order-2 lg:order-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={caption?.title ?? "intro"}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.4 }}
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                  {caption?.eyebrow ?? "Covera"}
                </span>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                  {caption?.title ?? "The insurance marketplace that texts you."}
                </h2>
                <p className="mt-3 max-w-md text-lg text-slate-600">
                  {caption?.body ??
                    "Scroll to watch a real conversation unfold, and the product form around it."}
                </p>
              </motion.div>
            </AnimatePresence>
            <div className="mt-6 flex gap-1.5">
              {steps.map((s, i) =>
                s.caption ? (
                  <span
                    key={i}
                    className={`h-1 w-8 rounded-full transition-colors ${
                      i < revealed ? "bg-emerald-500" : "bg-slate-200"
                    }`}
                  />
                ) : null,
              )}
            </div>
          </div>

          {/* Phone side */}
          <div className="order-1 lg:order-2">
            <PhoneFrame>
              <div ref={threadRef} className="scroll-thin h-[480px] space-y-3 overflow-y-auto bg-slate-50/60 px-3 py-4">
                {visible.map((m, i) => (
                  <MessageBubble key={i} message={m} />
                ))}
              </div>
              <div className="flex items-center gap-2 border-t border-slate-100 bg-white p-2.5">
                <div className="h-8 flex-1 rounded-full bg-slate-100" />
                <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </PhoneFrame>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";
import { motion } from "motion/react";
import type { ConvoMessage } from "@/lib/agents/types";
import { FeaturePanel } from "@/components/text/feature-panel";
import { cn } from "@/lib/utils";

// A single chat row: a blue agent bubble or a gray patient bubble, with the optional
// rich feature panel tucked underneath an agent message.
export function MessageBubble({
  message,
  onAsk,
}: {
  message: ConvoMessage;
  onAsk?: (text: string) => void;
}) {
  const isAgent = message.role === "agent";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className={cn("flex flex-col", isAgent ? "items-start" : "items-end")}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-snug shadow-sm",
          isAgent
            ? "rounded-bl-md bg-gradient-to-br from-sky-500 to-blue-600 text-white"
            : "rounded-br-md bg-slate-100 text-slate-800",
        )}
      >
        {message.text}
      </div>
      {isAgent && message.meta && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.35 }}
          className="mt-2 w-full max-w-[92%]"
        >
          <FeaturePanel meta={message.meta} onAsk={onAsk} />
        </motion.div>
      )}
    </motion.div>
  );
}

/** The animated three-dot "typing" indicator shown while the agent is thinking. */
export function TypingBubble() {
  return (
    <div className="flex items-start">
      <div className="rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2.5">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-slate-400"
              animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

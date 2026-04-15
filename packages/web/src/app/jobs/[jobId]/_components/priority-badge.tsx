import type { GapAdvice } from "@/lib/types";

const PRIORITY_CONFIG = {
  HIGH: {
    label: "HIGH",
    className: "bg-red-500/15 text-red-400 border-red-500/20",
    dot: "bg-red-500",
  },
  MEDIUM: {
    label: "MEDIUM",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    dot: "bg-amber-500",
  },
  LOW: {
    label: "LOW",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    dot: "bg-emerald-500",
  },
} as const;

export function PriorityBadge({ priority }: { priority: GapAdvice["priority"] }) {
  const config = PRIORITY_CONFIG[priority];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-semibold ${config.className}`}
    >
      <span className={`h-2 w-2 rounded-full ${config.dot}`} aria-hidden />
      {config.label}
    </span>
  );
}

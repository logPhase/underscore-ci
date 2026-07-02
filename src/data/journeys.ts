import { StatusKey } from "@/types/journey";

export const PILL_STYLES: Record<
  "all" | StatusKey,
  { active: string; idle: string }
> = {
  all: {
    active: "bg-zinc-700 text-zinc-100 border-zinc-600",
    idle: "bg-transparent text-zinc-400 border-zinc-700 hover:bg-zinc-800/60 hover:text-zinc-200",
  },
  affected: {
    active: "bg-amber-500/20 text-amber-200 border-amber-500/50",
    idle: "bg-transparent text-amber-400/80 border-amber-500/25 hover:bg-amber-500/10",
  },
  added: {
    active: "bg-emerald-500/20 text-emerald-200 border-emerald-500/50",
    idle: "bg-transparent text-emerald-400/80 border-emerald-500/25 hover:bg-emerald-500/10",
  },
  removed: {
    active: "bg-red-500/20 text-red-200 border-red-500/50",
    idle: "bg-transparent text-red-400/80 border-red-500/25 hover:bg-red-500/10",
  },
  demoted: {
    active: "bg-sky-500/20 text-sky-200 border-sky-500/50",
    idle: "bg-transparent text-sky-400/80 border-sky-500/25 hover:bg-sky-500/10",
  },
  unchanged: {
    active: "bg-zinc-500/25 text-zinc-100 border-zinc-500/50",
    idle: "bg-transparent text-zinc-500 border-zinc-700 hover:bg-zinc-800/60 hover:text-zinc-300",
  },
};

export const STATUS_DEFINITIONS: {
  key: StatusKey;
  label: string;
  dot: string;
  description: string;
}[] = [
  {
    key: "affected",
    label: "Affected",
    dot: "bg-amber-500",
    description:
      "Entry point exists in both base and HEAD, but at least one step in the trace changed (a method body, a call edge, or an inserted/removed step).",
  },
  {
    key: "added",
    label: "Added",
    dot: "bg-emerald-500",
    description:
      "A new top-level entry point introduced by this PR — either a brand-new method or a method that lost its in-codebase callers and is now reached from the outside.",
  },
  {
    key: "removed",
    label: "Removed",
    dot: "bg-red-500",
    description:
      "The entry-point method was deleted from HEAD. The trace shown is the base-time path; every step is gone.",
  },
  {
    key: "demoted",
    label: "Demoted",
    dot: "bg-sky-500",
    description:
      "The method still exists at HEAD with the same body, but is no longer a top-level entry point — something newly calls it in-codebase. The flow is now reachable as a sub-path of another journey rather than on its own.",
  },
  {
    key: "unchanged",
    label: "Unchanged",
    dot: "bg-zinc-500",
    description:
      'Entry point exists in both base and HEAD and every step in the trace is structurally identical. Listed under "Unaffected" below the impacted journeys.',
  },
];

// ── Journey store & indexes ─────────────────────────────────────────
export const JOURNEY_COLORS = [
  "#f06060",
  "#45c45f",
  "#f0c030",
  "#5bb8f5",
  "#c084fc",
  "#f97316",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#a78bfa",
];

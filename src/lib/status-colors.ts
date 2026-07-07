/** THE canonical PR-change palette — one scheme everywhere (founder rule):
 *  unchanged = neutral, added = green(mint), modified = amber(brown),
 *  deleted/removed = red(rose), disconnected = dim neutral.
 *
 *  Values are anchored to the report tokens (--bpmn-mint #7dd3ae,
 *  --bpmn-amber #d4a574, --bpmn-rose #d18589) with hsl variants for
 *  surfaces that need explicit fills/tints (SVG nodes, badges). Do NOT
 *  introduce local status hues in components — import from here.
 */

export type ChangeStatus =
  | "unchanged"
  | "added"
  | "modified"
  | "affected"
  | "deleted"
  | "removed"
  | "disconnected";

export interface StatusStyle {
  /** brand token — use where CSS vars work (borders, text, svg stroke) */
  solid: string;
  /** readable text color on dark surfaces */
  text: string;
  /** dark tinted fill for node/badge backgrounds */
  bg: string;
  /** border on tinted surfaces */
  border: string;
  label: string;
  icon: string;
}

const MINT: StatusStyle = {
  solid: "var(--bpmn-mint)",
  text: "hsl(155 45% 62%)",
  bg: "hsla(155, 45%, 14%, 0.95)",
  border: "hsl(155 40% 38%)",
  label: "added",
  icon: "+",
};

const AMBER: StatusStyle = {
  solid: "var(--bpmn-amber)",
  text: "hsl(33 55% 62%)",
  bg: "hsla(33, 50%, 14%, 0.95)",
  border: "hsl(33 50% 42%)",
  label: "modified",
  icon: "~",
};

const ROSE: StatusStyle = {
  solid: "var(--bpmn-rose)",
  text: "hsl(357 50% 66%)",
  bg: "hsla(357, 45%, 14%, 0.95)",
  border: "hsl(357 45% 45%)",
  label: "deleted",
  icon: "-",
};

const NEUTRAL: StatusStyle = {
  solid: "var(--bpmn-text-dim)",
  text: "hsl(224 18% 68%)",
  bg: "hsla(222, 16%, 13%, 0.95)",
  border: "hsl(222 12% 36%)",
  label: "unchanged",
  icon: "",
};

export const STATUS_STYLES: Record<ChangeStatus, StatusStyle> = {
  unchanged: NEUTRAL,
  added: MINT,
  modified: AMBER,
  affected: { ...AMBER, label: "affected" },
  deleted: ROSE,
  removed: { ...ROSE, label: "removed" },
  disconnected: {
    ...NEUTRAL,
    label: "disconnected",
    icon: "⦸",
    text: "hsl(222 12% 60%)",
  },
};

export function statusStyle(
  status: string | null | undefined
): StatusStyle {
  return STATUS_STYLES[(status || "unchanged") as ChangeStatus] ?? NEUTRAL;
}

/** Print tones for PAPER (light) surfaces — same hue families, darkened for
 * contrast on cream. Key them like STATUS_STYLES so surfaces can't drift. */
export const STATUS_PAPER: Record<ChangeStatus, string> = {
  unchanged: "#5c6577",
  added: "#2e7d5b",
  modified: "#9a6217",
  affected: "#9a6217",
  deleted: "#b04a52",
  removed: "#b04a52",
  disconnected: "#6b7280",
};

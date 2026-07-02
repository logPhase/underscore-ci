import { FunctionRole } from "@/types/analysis";

// Function-level mock data for component detail view (Rule 6: deepest zoom)
export const FUNCTION_ROLE_COLORS: Partial<Record<FunctionRole, string>> = {
  "entry-point": "hsl(25, 75%, 55%)", // warm accent
  orchestrator: "hsl(340, 60%, 55%)", // rose
  "data-transformer": "hsl(210, 60%, 55%)", // blue
  validator: "hsl(145, 50%, 48%)", // green
  "event-handler": "hsl(275, 50%, 55%)", // purple
  "data-access": "hsl(185, 50%, 48%)", // teal
  "error-handler": "hsl(220, 10%, 45%)", // grey
  utility: "hsl(220, 15%, 40%)", // muted
};

// ── Color palette ──────────────────────────────────────────────────

/** HSL palette cycled over services. Matches the aesthetic of the mock SERVICE_COLORS. */
export const COLOR_PALETTE = [
  "hsl(215,55%,52%)",
  "hsl(150,48%,45%)",
  "hsl(275,50%,52%)",
  "hsl(185,48%,45%)",
  "hsl(32,62%,52%)",
  "hsl(335,50%,52%)",
  "hsl(60,48%,45%)",
  "hsl(120,45%,48%)",
  "hsl(200,55%,50%)",
  "hsl(310,45%,50%)",
  "hsl(25,55%,50%)",
  "hsl(170,50%,45%)",
];

// ── Validation helpers ─────────────────────────────────────────────

export const VALID_SEMANTIC_ROLES: Set<string> = new Set([
  "api-controller",
  "data-access",
  "middleware",
  "business-logic",
  "utility",
  "configuration",
  "test",
  "event-handler",
  "validator",
  "transformer",
]);

export const VALID_FUNCTION_ROLES: Set<string> = new Set([
  "entry-point",
  "data-transformer",
  "validator",
  "error-handler",
  "utility",
  "orchestrator",
  "event-handler",
  "data-access",
]);

export const VALID_CONFIDENCES: Set<string> = new Set(["high", "medium"]);

export const VALID_CRITICALITIES: Set<string> = new Set([
  "high",
  "medium",
  "low",
]);
export const VALID_STATUSES: Set<string> = new Set([
  "ai-draft",
  "reviewed",
  "edited",
]);

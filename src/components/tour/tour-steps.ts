/** Declarative tour script. Steps anchor on stable data-tour attributes —
 *  never class names — and every step must survive its target being absent
 *  (the overlay auto-advances). Content budget: ≤7 steps, ≤2 sentences per
 *  body (working-memory rule; this is a 60-second orientation, not a manual). */

export interface TourStep {
  id: string;
  /** Route the step lives on; null route = step unavailable, skip it. */
  route: string | null;
  /** CSS selector to spotlight; null = centered card, no cutout. */
  target: string | null;
  title: string;
  body: string;
  placement?: "right" | "left" | "top" | "bottom";
}

export interface TourContext {
  /** Chapter path of the journey the tour rides into (first board row). */
  firstChapterPath: string | null;
  hasSpecs: boolean;
  hasFindings: boolean;
  /** Whether this is a PR session (overlay + toggle exist). */
  hasPR: boolean;
}

export function buildTourSteps(ctx: TourContext): TourStep[] {
  const views =
    "Canvas is the map, Journeys are the flows" +
    (ctx.hasSpecs ? ", Specs is the agreed behavior" : "") +
    (ctx.hasFindings ? ", Findings is what disagrees with it" : "") +
    ".";

  const steps: (TourStep | null)[] = [
    {
      id: "welcome",
      route: "/journeys",
      target: null,
      title: "A map of what the code actually does",
      body:
        "This report read the codebase and mapped it into business journeys — " +
        "real execution paths, from trigger to outcome. " +
        (ctx.hasPR
          ? "Every pull request gets a session like this one."
          : "Each analysis run produces a session like this one."),
    },
    {
      id: "rail",
      route: "/journeys",
      target: '[data-tour="rail-nav"]',
      placement: "right",
      title: "Different views of the same code",
      body: views + " You are always one click from each.",
    },
    {
      id: "row",
      route: "/journeys",
      target: '[data-tour="journey-row"]',
      placement: "bottom",
      title: "Each line is one journey",
      body:
        "A row is one path through the code, drawn like a transit line." +
        (ctx.hasPR ? " An amber Δ means this pull request touches it." : "") +
        " Click any row to ride the line.",
    },
    ctx.firstChapterPath
      ? {
          id: "bpmn",
          route: ctx.firstChapterPath,
          target: '[data-tour="bpmn-canvas"]',
          placement: "top",
          title: "The journey as a flow",
          body:
            "Every box and gateway here is grounded in the actual code — nothing " +
            "is invented. Hover a step to trace its path; double-click one to " +
            "read its code.",
        }
      : null,
    ctx.firstChapterPath
      ? {
          id: "call-graph",
          route: ctx.firstChapterPath,
          target: '[data-tour="call-graph"]',
          placement: "top",
          title: "The code beneath the flow",
          body:
            "Below the diagram, the call graph traces every function this journey " +
            "calls. Drag to pan it; click any node to read its source alongside.",
        }
      : null,
    ctx.firstChapterPath
      ? {
          id: "ask",
          route: ctx.firstChapterPath,
          target: '[data-tour="ask-ai"]',
          placement: "left",
          title: "Ask, with receipts",
          body:
            "Select a step and CODE shows its source. Ask AI answers questions " +
            "grounded in this journey and your team's documentation.",
        }
      : null,
    ctx.hasPR
      ? {
          id: "pr-toggle",
          route: "/journeys",
          target: '[data-tour="pr-toggle"]',
          placement: "bottom",
          title: "One switch, two views",
          body:
            "This switch flips between the whole codebase and just what this " +
            "pull request changes — same map, different ink.",
        }
      : null,
    {
      id: "canvas",
      route: "/canvas",
      target: '[data-tour="canvas-root"]',
      placement: "bottom",
      title: "The city map",
      body:
        "Districts are functional groups; the colored lines are the journeys " +
        "you just met. Same code, seen from above.",
    },
  ];
  return steps.filter((s): s is TourStep => s !== null);
}

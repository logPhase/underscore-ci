import type {
  BpmnElement,
  BpmnFlow,
  BpmnJourney,
} from "@/components/bpmn/types";
import { shortNameFromFqn } from "./utils";

export interface SynthStep {
  fqn: string;
  name?: string;
  class?: string;
}

export interface SynthEdge {
  from: string;
  to: string;
}

const START = "__start__";
const END = "__end__";

/**
 * Deterministic BPMN-lite diagram synthesized from a journey's call trace
 * (steps + edges). Used when the AI Business-Flow diagram is missing or empty
 * — e.g. the analyzer `/bpmn` call timed out — so every call graph still shows
 * a flow on screen, with no LLM and no re-run. One service-task per traced
 * method; flows follow the recorded call edges, with a synthetic start before
 * the entry method and an end after every leaf. Honest by construction: it is
 * exactly the static call trace, no inferred business semantics.
 */
export function synthBpmnFromTrace(input: {
  journeyId: string;
  title: string;
  entryFqn: string;
  steps: SynthStep[];
  edges: SynthEdge[];
}): BpmnJourney & { synthetic: true } {
  const { journeyId, title, entryFqn, steps, edges } = input;

  const byFqn = new Map<string, SynthStep>();
  for (const s of steps) byFqn.set(s.fqn, s);

  // Node order: steps first (preserves trace order), then any edge endpoint
  // not already represented by a step.
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (fqn: string) => {
    if (fqn && !seen.has(fqn)) {
      seen.add(fqn);
      ordered.push(fqn);
    }
  };
  for (const s of steps) add(s.fqn);
  for (const e of edges) {
    add(e.from);
    add(e.to);
  }

  const labelFor = (fqn: string): string => {
    const s = byFqn.get(fqn);
    if (s?.name) return s.class ? `${s.class}.${s.name}` : s.name;
    return shortNameFromFqn(fqn);
  };

  const flows: BpmnFlow[] = [];
  const entry = seen.has(entryFqn) ? entryFqn : ordered[0];
  if (entry) flows.push({ from: START, to: entry });

  const hasOut = new Set<string>();
  for (const e of edges) {
    if (seen.has(e.from) && seen.has(e.to)) {
      flows.push({ from: e.from, to: e.to });
      hasOut.add(e.from);
    }
  }

  const leaves = ordered.filter((fqn) => !hasOut.has(fqn));
  for (const fqn of leaves) flows.push({ from: fqn, to: END });

  const elements: BpmnElement[] = [
    { id: START, type: "start-event", label: "Start" },
    ...ordered.map(
      (fqn): BpmnElement => ({
        id: fqn,
        type: "service-task",
        label: labelFor(fqn),
      })
    ),
  ];
  // Only add an end node when something actually reaches it (a pure cycle has
  // no leaf — leave it out rather than dangle an unreachable end).
  if (leaves.length > 0) {
    elements.push({
      id: END,
      type: "end-event",
      label: "End",
      outcome: "success",
    });
  }

  // `synthetic: true` is the honesty marker — this is the deterministic
  // call-trace fallback, NOT the AI business-flow diagram. The AI diagram
  // (j.bpmn) never carries this flag, so the journey view can show a banner
  // and never let the raw-method-name fallback masquerade as the AI flow.
  return {
    journey_id: journeyId,
    title,
    elements,
    flows,
    narrative: "",
    synthetic: true,
  };
}

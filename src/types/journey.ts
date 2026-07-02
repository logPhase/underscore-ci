// Journey Chapter types — structural model + optional AI-enriched fields
// (per-step findings, per-journey reviewSummary, BPMN business-flow diagram).

// BPMN-lite shape produced by the Business Flow Diagrammer agent.
// The canonical type lives in components/bpmn/types.ts (sourced from the
// flow-weaver design). We alias to `BpmnDiagram` so the rest of the app
// matches the webapp's naming.
import type { BpmnAudit, BpmnJourney } from "@/components/bpmn/types";

// `synthetic` marks the deterministic call-trace fallback
// (synthBpmnFromTrace) so the journey view never lets it masquerade as the
// AI business-flow diagram. The AI diagram never carries this flag. Added
// here via intersection so the canonical components/bpmn/types.ts stays the
// renderer's untouched contract (it only reads BpmnElement.label).
export type BpmnDiagram = BpmnJourney & { synthetic?: boolean };
export type { BpmnAudit } from "@/components/bpmn/types";

export type ChapterCriticality = "high" | "medium" | "low";
export type ChapterStatus = "ai-draft" | "reviewed" | "edited";

/** PR-level status baked onto a journey. Absent when not in PR mode or when
 *  a matched journey has no changed steps.
 *  - added: new entry point in HEAD
 *  - removed: entry point method deleted from HEAD
 *  - affected: entry point in both, internal steps changed
 *  - demoted: was an entry point at base, method still exists at HEAD but is
 *    no longer top-level (something now calls it in-codebase) */
export type ChapterPRStatus = "added" | "removed" | "affected" | "demoted";

/** PR-level status on a single step. Sourced from the global prChanges[fqn]
 *  map — undefined when the step is unchanged. */
export type StepPRStatus = "deleted" | "disconnected" | "modified" | "added";

/** Interface/abstract contract step. Concrete steps omit the field. */
export type StepKind = "interface" | "abstract";

/** Severity bucket emitted by the multi-agent reviewer. P0=critical, P3=low. */
export type FindingCategory = "P0" | "P1" | "P2" | "P3";

/** Specialist that produced a finding. Stored as a comma-joined string when
 *  multiple agents flagged the same defect (orchestrator-side dedup). */
export type FindingAgent =
  | "error-propagation"
  | "state-contracts"
  | "data-flow"
  | string;

export interface Finding {
  fqn: string;
  category: FindingCategory;
  title: string;
  message: string;
  evidence: string[];
  confidence: 50 | 75 | 100;
  agent: FindingAgent;
}

export interface ReviewSummary {
  risk: "low" | "medium" | "high";
  findingCount: number;
  topCategory: FindingCategory | null;
  topAgent: FindingAgent | null;
  narrative: string;
}

export type StatusKey =
  | "affected"
  | "added"
  | "removed"
  | "demoted"
  | "unchanged";

export interface ChapterStep {
  fqn: string;
  name: string;
  class: string;
  file: string;
  body?: string;
  prStatus?: StepPRStatus;
  beforeBody?: string;
  kind?: StepKind;
  /** Per-step findings emitted by the multi-agent reviewer. Optional —
   *  present only when --review ran AND the reviewer attached findings to
   *  this specific step. */
  findings?: Finding[];
}

export interface Chapter {
  id: string;
  slug: string;
  title: string;
  summary: string;
  criticality: ChapterCriticality;
  services: string[]; // derived at load time
  functions: string[]; // derived at load time from edges + entryFqn
  edges: { from: string; to: string }[]; // [from, to] in source JSON, normalized here
  steps: ChapterStep[]; // hydrated from methods[] + prChanges[]
  phaseCount: number; // derived = phases.length
  phases: { name: string; narrative: string; fqns: string[] }[];
  status: ChapterStatus;
  prStatus?: ChapterPRStatus;
  reviewSummary?: ReviewSummary;
  /** AI-generated narrative for the journey. Empty string when narratives
   *  are skipped (default in PR mode without --with-narratives). */
  globalNarrative: string;
  /** Mermaid `graph TD` flowchart string. Empty when not generated. */
  flowchart: string;
  /** Optional BPMN-lite business-flow diagram emitted by the Business Flow
   *  Diagrammer agent. Absent when the agent didn't run, didn't produce a
   *  diagram for this journey, or the journey was skipped (test/trivial/
   *  kitchen-sink dispatcher). */
  bpmn?: BpmnDiagram;
  /** Validation report from the deterministic gate + agent self-audit
   *  ('errors' | 'warnings' | 'clean' verdict + per-issue list). Present
   *  whenever a BPMN was attempted. */
  bpmnValidation?: BpmnAudit;
  entryFqn: string;
  handlerType: "command" | "event" | "background" | "http";
  color: string;
  /** AI-driven intent classification (added by underscore-cli.intent-classifier).
   *  - `primary`   journeys directly implement a PR scope decision / incident fix
   *  - `secondary` journeys are supporting changes (often decorator-wrapped consumers)
   *  - `noise`     journeys are structurally flagged but semantically inert
   *  Absent when classification didn't run for this journey (i.e. not PR-affected). */
  intentCategory?: "primary" | "secondary" | "noise";
  /** When the structural prStatus is misleading, this names the actual change:
   *  `decorator-wrap` (old path reachable via new wrapper), `scaffolding` (DI/wiring),
   *  `rename-or-move`, `behaviour-change`, `true-removal`, `true-addition`. */
  intentReclass?:
    | "decorator-wrap"
    | "scaffolding"
    | "rename-or-move"
    | "behaviour-change"
    | "true-removal"
    | "true-addition";
  /** One-sentence explanation linking this journey to specific intent claims
   *  (often citing claim IDs from the ctxt knowledge graph). */
  intentWhy?: string;
  /** PR-specific 3-5 word label for the actual change (e.g. "events-emitting
   *  decorator weave", "schema-migration shim"). Always populated when the
   *  classifier ran, even when intentReclass enum returns null — captures
   *  specifics the closed enum can't. */
  intentReclassFreeform?: string;
}

export interface Anomaly {
  id: string;
  affectedElement: string;
  anomalyType:
    | "coupling"
    | "complexity"
    | "orphaned"
    | "churn-no-tests"
    | "boundary-violation"
    | "bus-factor";
  severity: "high" | "medium" | "low";
  shortDescription: string;
  explanation: string;
  confidence: "high" | "medium";
}

export interface FunctionNode {
  id: string;
  name: string;
  signature: string;
  description: string;
  service: string;
  chapters: string[];
  importance: number;
}

export interface RawFile {
  service: string;
  package: string;
  sizeLines: number;
  isEntryPoint: boolean;
  semanticRole: string;
  confidence: string;
  methods: string[]; // FQN refs into the global methods registry
  complexityScore?: number; // canvas health-stain input
  importance?: number; // focal/ambient/suppressed tier input
}

export interface RawMethod {
  name: string;
  classFqn: string;
  file: string;
  body: string;
  role: string;
  importance: number;
  complexity: number;
  lines: number;
  params: string[];
  returnType: string;
  description: string;
  isPublic: boolean;
  kind?: "interface" | "abstract";
}

export interface RawStep {
  fqn: string;
  prStatus?: "added" | "modified" | "deleted" | "disconnected";
  beforeBody?: string;
  /** Per-step findings from the multi-agent reviewer (--review runs only). */
  findings?: Finding[];
}

export interface RawJourney {
  id: string;
  title: string;
  entryFqn: string;
  handlerType: string;
  criticality: string;
  status: string;
  edges: [string, string][];
  phases: { name: string; narrative: string; fqns: string[] }[];
  steps: RawStep[]; // {fqn, prStatus?, beforeBody?} — PR data is per-step (journey-contextual)
  prStatus?: string;
  // Optional AI-enriched keys (absent on structural-only runs). Wire shapes
  // are passed through verbatim by the transform — see transformChapters.
  summary?: string;
  reviewSummary?: unknown;
  bpmn?: unknown;
  bpmnValidation?: unknown;
  flowchart?: unknown;
}

export interface RawSharedLib {
  id: string;
  name: string;
  consumedBy: string[];
  cx: number;
  cy: number;
  radius: number;
  seed: number;
}

export interface RawService {
  id: string;
  name: string;
  healthScore: number;
  cx: number;
  cy: number;
  radius: number;
  seed: number;
  packages: string[];
}

export interface RawDependency {
  from: string;
  to: string;
  importCount: number;
  isViolation: boolean;
  label?: string;
  aiContext?: string;
}

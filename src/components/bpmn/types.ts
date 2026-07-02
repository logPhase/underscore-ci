export type BpmnElementType =
  | "start-event"
  | "end-event"
  | "service-task"
  | "user-task"
  | "exclusive-gateway"
  | "parallel-gateway"
  // Composite-flow types: a `call-activity` is a reference to another
  // journey (Camunda subprocess marker — `+` icon, click to drill in).
  // `missing-call-activity` flags a step in a business flow that has
  // no corresponding journey yet (dashed border, amber tone) — the
  // user should generate a journey for it.
  | "call-activity"
  | "missing-call-activity";

export type EndOutcome = "grant" | "deny" | "error" | "success";

/**
 * Per-element evidence cited by the agent. The bridge between the BPMN
 * element and the source code that justifies it. Rendered in the side
 * panel on click.
 */
export interface BpmnCodeEvidence {
  fqn: string;
  signature: string;
  file: string;
  lines: string;        // e.g. "42-58"
  snippet: string;      // verbatim source slice, 5-15 lines
  comment: string;      // 1-2 sentences in business voice
}

export interface BpmnElement {
  id: string;
  type: BpmnElementType;
  label: string;
  actor?: string;
  /** For type='call-activity': the journey id and slug this node points
   *  at. Click navigates to /journeys/<journey_slug>?from=composite:<hash>.
   *  Absent (or set with no slug) for missing-call-activity. */
  journey_id?: string;
  journey_slug?: string;
  /** Legacy: bare FQN list. New diagrams use `code_evidence` instead.
   *  Kept for backward compatibility with v1-v4 BPMN data still on disk. */
  code_fqns?: string[];
  /** Rich per-element citation: signature, snippet, comment, file:line.
   *  Mandatory for service-task / gateway / end-event in v5+ output. */
  code_evidence?: BpmnCodeEvidence[];
  outcome?: EndOutcome;
}

/**
 * Self-audit verdict produced alongside the diagram (single-agent
 * two-phase output). Empty `issues` ⇒ verdict "ok".
 */
export type BpmnAuditSeverity = "error" | "warning" | "info";
export type BpmnAuditKind =
  | "snippet-mismatch"
  | "missing-fqn"
  | "interface-not-impl"
  | "collapsed-rule"
  | "unreachable"
  | "structural"
  | "other";

export interface BpmnAuditIssue {
  journey_id: string;
  element_id: string;        // or "global"
  severity: BpmnAuditSeverity;
  kind: BpmnAuditKind;
  claim: string;
  actual: string;
  fix_hint: string;
}

export interface BpmnAudit {
  verdict: "ok" | "warnings" | "errors";
  issues: BpmnAuditIssue[];
}

export interface BpmnFlow {
  from: string;
  to: string;
  condition?: string;
}

export interface BpmnActor {
  id: string;
  label: string;
}

export interface BpmnJourney {
  journey_id: string;
  title: string;
  intent?: string;
  actors?: BpmnActor[];
  elements: BpmnElement[];
  flows: BpmnFlow[];
  narrative?: string;
}

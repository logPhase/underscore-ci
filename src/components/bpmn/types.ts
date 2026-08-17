export type BpmnElementType =
  | "start-event"
  | "end-event"
  // A terminal error boundary — the analyzer emits this for rejection /
  // failure ends (rose ring with an ×). Distinct from a plain end-event so
  // the layout sizes it as an event and the node renders the error styling
  // without depending on the `outcome` field being present.
  | "error-end-event"
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

/**
 * Spec-check annotation the diagrammer attaches to PR-CHANGED elements —
 * the changed behaviour compared against a living spec (this repo's or a
 * same-project sibling's). Grounded analyzer-side: the capability resolves
 * to a real spec and `requirement` is a verified verbatim quote, so the
 * renderer may trust both.
 */
export interface BpmnSpecRef {
  /** Capability slug — matches SpecEntry.capability in the specs payload
   *  when the spec belongs to the analyzed repo. */
  capability: string;
  /** Analyzer repo id the spec belongs to. Compare against the specs
   *  payload's repo_id: a mismatch means a sibling repo's spec (full text
   *  not baked into this report — the quoted requirement carries it). */
  repo?: string;
  /** conflicts = the changed code contradicts the quoted requirement. */
  verdict: "conflicts" | "aligned";
  /** The requirement, quoted verbatim from the spec. */
  requirement: string;
  /** One sentence: how the changed code meets or contradicts it. */
  why?: string;
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
  /** THE function this element is — the one its label describes, chosen by
   *  the agent from its own `code_fqns` (validation rules v5+). An element
   *  may legitimately cite the caller that reaches it and the collaborators
   *  it uses; without this, all of them render as equal peers and the reader
   *  cannot tell which one does the work. Absent on diagrams produced before
   *  v5, and on elements citing 0-1 functions where it is unambiguous. */
  primary_fqn?: string;
  /** One line, business voice, on why that function is the primary. */
  primary_why?: string;
  outcome?: EndOutcome;
  /** Spec-check verdicts on a PR-changed element (v7+ diagrams). Absent on
   *  unchanged elements and on diagrams produced before the spec check. */
  spec_refs?: BpmnSpecRef[];
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

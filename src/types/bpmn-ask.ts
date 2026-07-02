/** Step-scoped Q&A against the analyzer's POST /bpmn/ask — a developer clicks a
 *  BPMN step, asks a question, and gets a grounded, cited answer. Sibling of
 *  /ask. Bearer-auth + credit-metered; the call runs in the Electron main
 *  process (CSP-safe), so the renderer talks to it over this IPC channel. */

export const BPMN_ASK_IPC = "analyzer:bpmn-ask";

export interface BpmnAskCitation {
  kind: "doc" | "fact" | "impact";
  ref: string;
  title?: string;
}

export interface BpmnAskRequest {
  /** required, 1–2000 chars (validated client-side before sending) */
  question: string;
  /** the FQN of the selected step, when one is selected — grounds the answer */
  step_fqn?: string;
  /** the step function's FULL source — docstring + leading comments + body */
  step_source?: string;
  /** the journey the step sits in — grounds the flow + biases retrieval. Each
   *  step carries its source so journey-level questions (no step selected) are
   *  grounded on the whole journey, not just one step. */
  journey?: {
    title: string;
    steps: { fqn: string; title?: string; source?: string }[];
  };
  repo_id?: string;
  session_id?: string;
}

export interface BpmnAskResponse {
  /** markdown */
  answer: string;
  repo_id: string;
  citations: BpmnAskCitation[];
  usage: Record<string, unknown>;
}

/** The main process maps the HTTP status → a code so the renderer can show the
 *  right message (503 → "ask unavailable") without seeing transport details. */
export type BpmnAskResult =
  | { ok: true; data: BpmnAskResponse }
  | {
      ok: false;
      code:
        | "blank-question"
        | "unavailable"
        | "unauthenticated"
        | "unreachable"
        | "unknown";
      error: string;
    };

/** Build the POST /bpmn/ask body from the panel's inputs. Centralized so a
 *  test can assert session_id + repo_id are ALWAYS carried — the analyzer
 *  needs them to pick the knowledge base + the staged session. */
export function buildAskRequest(opts: {
  question: string;
  stepFqn?: string;
  stepSource?: string;
  journey?: BpmnAskRequest["journey"];
  sessionId?: string;
  repoId?: string;
}): BpmnAskRequest {
  return {
    question: opts.question,
    step_fqn: opts.stepFqn,
    step_source: opts.stepSource,
    journey: opts.journey,
    session_id: opts.sessionId,
    repo_id: opts.repoId,
  };
}

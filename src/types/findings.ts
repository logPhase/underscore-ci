// Correctness-audit findings — the analyzer's review agent cross-references
// the PR's changed code against ingested institutional knowledge (Confluence
// et al.) and emits structured findings. The CLI bakes the analyzer response
// into the payload verbatim, so these keys match the wire shape exactly.

export interface FindingCitation {
  /** Knowledge-doc title the finding leans on. */
  title: string;
  /** Curator link (URL) or knowledge id — linkified only when http(s). */
  ref?: string | null;
  /** The documented claim, quoted verbatim from the knowledge chunk. */
  quote?: string | null;
}

export type FindingKind = "divergence" | "bug";
export type FindingLevel = "high" | "medium" | "low";

export interface Finding {
  id: string;
  /** divergence = code contradicts documented behavior; bug = plain correctness. */
  kind: FindingKind;
  severity: FindingLevel;
  /** Honest uncertainty — low-confidence findings render visually subdued. */
  confidence: FindingLevel;
  title: string;
  /** Markdown body: what's wrong and why it matters. */
  detail: string;
  file?: string | null;
  symbol?: string | null;
  /** Code evidence excerpt (verbatim from the changed method). */
  excerpt?: string | null;
  /** What the documentation says should happen (divergence findings). */
  expected?: string | null;
  /** What the code actually does. */
  observed?: string | null;
  citations: FindingCitation[];
  /** How a human verifies this finding. */
  check?: string | null;
}

export interface FindingsPayload {
  items: Finding[];
  /** Knowledge docs the agent consulted while auditing (cited or not). */
  consulted: { title: string; ref?: string | null }[];
  /** Analyzer prompt version that produced this bundle. */
  version?: number;
}

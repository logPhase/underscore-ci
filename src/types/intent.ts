// PR-overview + journey-knowledge types — ported from the webapp's
// data/journeyTypes.ts (AI-enriched sections). Structural Chapter types stay
// in ./journey.ts; this file carries the overlay surfaces the parity data
// adapter (src/data/parity-loader.ts) exposes.

// ── PR Overview (journey-connection agent) ──────────────────────────────
// Embedded as `prOverview` by the CLI when OVERVIEW_ENABLED=1. Connects
// the PR's journeys: narrative + per-journey roles + typed links.

export interface PrOverviewRole {
  id: string;
  /** core = implements the PR's purpose; supporting = adapted to enable
   *  it; ripple = touched mechanically. */
  role: "core" | "supporting" | "ripple" | string;
  why?: string;
}

export interface PrOverviewLink {
  from: string;
  to: string;
  /** shared-steps | contains-entry | shared-class | agent-emitted kind */
  kind?: string;
  /** 2-5 word business label, e.g. "HASH cache writer to reader". */
  label?: string;
  explanation?: string;
  /** true = semantic link inferred by the agent (rendered dashed);
   *  false = structurally verified from the call trees. */
  inferred?: boolean;
  via?: string[];
  strength?: number;
}

export interface PrOverview {
  prNarrative?: string;
  journeys: PrOverviewRole[];
  links: PrOverviewLink[];
  generatedAt?: string;
}

// ── Journey knowledge (per-step docs + graph facts) ─────────────────────
// Embedded as `journeyKnowledge` by the CLI. Per journey, per step (keyed by
// the step's FQN), the relevant Confluence passages and knowledge-graph facts
// the analyzer surfaced. A step with no relevant context is ABSENT from its
// `steps` map (honest no-context).

/** A Confluence passage cited for a step. `snippet` is a quoted passage;
 *  `cite` is a URL or a `:Knowledge` id. */
export interface Doc {
  title: string;
  snippet: string;
  cite: string;
  score: number;
}

/** A graph fact. `invalid_at` set ⇒ the fact has been superseded. */
export interface Fact {
  fact: string;
  valid_at: string | null;
  invalid_at: string | null;
}

/** The analyzer's synthesized English summary of a step's docs — clean prose
 *  distilled from the raw snippets. The knowledge panel leads with this. */
export interface KnowledgeSummary {
  summary: string;
  cites: string[];
}

export interface JourneyKnowledgeResponse {
  repo_id: string | null;
  journeys: {
    journey_id: string;
    /** Keyed by step FQN. Absent key ⇒ no relevant context for that step. */
    steps: Record<
      string,
      { knowledge?: KnowledgeSummary; docs: Doc[]; facts: Fact[] }
    >;
  }[];
  generated_at: string;
}


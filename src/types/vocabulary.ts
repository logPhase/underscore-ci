/**
 * The living domain vocabulary — the repo's ubiquitous language, maintained
 * by the analyzer's synth agent and baked into pr-output.json as
 * `vocabulary` (entrypoint.sh merges GET /vocabulary; the memory-store
 * files behind it are an agent-editing concern the renderer never sees).
 */

export interface VocabCodeRef {
  /** The symbol that embodies the term — renders as a chip; resolves to a
   *  file via the global method index when it can. */
  fqn: string;
  /** The name the code uses at that site, when it differs from the
   *  canonical term — the raw material of language drift. */
  alias: string;
}

export interface VocabTerm {
  name: string;
  slug: string;
  capability: string;
  /** Business voice, no code names — the sentence a PM gets. */
  definition: string;
  code: VocabCodeRef[];
  /** How the business says it, with a bracketed source-doc citation.
   *  Present only when the knowledge base actually uses the term. */
  business: string;
  /** Journey ids the term appears in — cross-links into /journeys. */
  journeys: string[];
  /** Slugs of related terms — the explicit edges of the vocabulary graph. */
  related: string[];
  /** Neutral language-drift observations ("code also calls this X in
   *  cpms/"). Evidence, never verdicts. */
  notes: string[];
}

export interface VocabPayload {
  repo_id: string;
  terms: VocabTerm[];
}

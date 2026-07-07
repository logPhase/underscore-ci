// Behavioral specs (EARS markdown) the analyzer's synth agent maintains per
// repo. In the static report the whole specs bundle — living specs, history,
// and every referenced version's content — is embedded into pr-output.json at
// analysis time by the CLI (there is no analyzer to call at view time).
// Shapes mirror the analyzer's /specs* endpoints.

export interface SpecEntry {
  /** Stable capability slug (the folder name), e.g. "license-plate-identifier". */
  capability: string;
  /** Storage path; informational. */
  path: string;
  /** The spec as markdown. */
  content: string;
}

/** The style vocabulary the UI knows. The WIRE may carry more (newer
 * analyzers emit e.g. "modified") — wire fields are typed string and every
 * lookup must be tolerant (see specs.tsx opStyle). */
export type SpecOperation = "created" | "updated" | "deleted";

export interface SpecHistoryEvent {
  version_id: string;
  capability: string;
  path: string;
  operation: string;
  at: string;
  size: number;
  sha256: string;
}

export interface SpecVersionContent {
  version_id: string;
  capability: string;
  path: string;
  operation: string;
  at: string;
  content: string;
}

/** The `specs` key of pr-output.json — the full bundle baked in by the CLI.
 *  `versions` holds content for the history events the CLI exported (newest
 *  first, capped); a version_id absent from the map simply has no diff. */
export interface SpecsPayload {
  repo_id: string;
  specs: SpecEntry[];
  history: SpecHistoryEvent[];
  versions: Record<string, SpecVersionContent>;
}

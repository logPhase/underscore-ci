// Repo-level HUB manifest — the repository's home page data. Distinct from a
// per-PR report (pr-output.json): the manifest is hosted ONCE at the report
// tree root and indexes every analyzed PR, plus the GLOBAL system artifacts
// (architecture + living specs) that belong to the repo as a whole rather than
// to any single PR.
//
// The analyzer emits it on merge-to-main (the trunk actually changed); each
// PR's report still ships its own self-contained pr-output.json under
// pr-<n>/. The viewer boots in "repo mode" when this manifest is present at
// the served root, and in single-report mode otherwise (so every existing
// standalone demo keeps working untouched).

import type { ArchitecturePayload } from "./architecture";
import type { SpecsPayload } from "./specs";

export interface RepoManifestPr {
  /** PR number when known (GitHub-driven analyses). */
  number?: number;
  title: string;
  /** Head branch. */
  branch?: string;
  author?: string;
  /** PR lifecycle state. */
  state?: "open" | "merged" | "closed" | string;
  /** Relative URL to this PR's hosted report directory, e.g. "pr-607/". */
  url: string;
  /** ISO timestamp the report was built. */
  updatedAt?: string;
  /** Composed-journey count — the report's headline number. */
  journeys?: number;
  /** Optional one-line summary of what the PR does. */
  summary?: string;
}

export interface RepoManifest {
  /** Schema tag, e.g. "underscore.repo-manifest/v1". */
  schema?: string;
  /** Analyzer repo key / "owner/repo". */
  repo: string;
  repoUrl?: string | null;
  /** ISO timestamp the manifest was (re)generated. */
  generatedAt?: string;
  /** The repo's GLOBAL system architecture — same shape a report bakes in. */
  architecture?: ArchitecturePayload | null;
  /** The repo's GLOBAL living-specs bundle — same shape a report bakes in. */
  specs?: SpecsPayload | null;
  /** Every analyzed PR, newest first is not assumed — the hub sorts. */
  prs: RepoManifestPr[];
}

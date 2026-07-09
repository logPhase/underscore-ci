// Shared TypeScript types for the Underscore analysis pipeline.
//
// These types mirror the JSON contract produced by the Clojure backend
// (export.clj / build-frontend-json). Keep in sync with the Clojure side.
// All field names use camelCase matching the JSON keys emitted by the backend.

import { JourneyData } from "@/store/use-journey-store";
import {
  RawDependency,
  RawSharedLib,
  RawFile,
  RawMethod,
  RawService,
  RawJourney,
  Chapter,
  Anomaly,
} from "./journey";
import {
  JourneyKnowledgeResponse,
  PrOverview,
} from "./intent";

// ---------------------------------------------------------------------------
// Analysis data — the output.json shape
// ---------------------------------------------------------------------------

export type LayoutTier = "focal" | "ambient" | "suppressed";
export type FunctionRole =
  | "entry"
  | "controller"
  | "service"
  | "repository"
  | "utility"
  | "model"
  | "unknown"
  | MonoRepoFunctionRole;

export type MonoRepoFunctionRole =
  | "entry-point"
  | "data-transformer"
  | "validator"
  | "error-handler"
  | "utility"
  | "orchestrator"
  | "event-handler"
  | "data-access";

export type MonoRepoSemanticRole =
  | "api-controller"
  | "data-access"
  | "middleware"
  | "business-logic"
  | "utility"
  | "configuration"
  | "test"
  | "event-handler"
  | "validator"
  | "transformer";

export type SemanticRole =
  | "controller"
  | "service"
  | "repository"
  | "model"
  | "utility"
  | "test"
  | "config"
  | "unknown"
  | MonoRepoSemanticRole;
export type ConfidenceLevel = "high" | "medium" | "low";
export type ChangeType = "added" | "modified" | "deleted";
export type Significance = "critical" | "high" | "medium" | "low" | "trivial";

export interface MonoService {
  id: string;
  name: string;
  healthScore: number;
  cx: number;
  cy: number;
  radius: number;
  seed: number;
  packages: string[];
  aiSummary?: string;
}

export type MonoDependency = RawDependency;

export interface CrossServiceCall {
  from: string;
  to: string;
  fromService: string;
  toService: string;
}

export interface MonoFile {
  id: string;
  path: string;
  service: string;
  pkg: string;
  name: string;
  sizeLines: number;
  testCoverage: number;
  complexityScore: number;
  lastModifiedMonths: number;
  changeCount90Days: number;
  contributors: string[];
  isEntryPoint: boolean;
  semanticRole: SemanticRole;
  aiSummary: string;
  domainConcepts: string[];
  confidence: "high" | "medium";
  importance?: number;
  layoutTier?: "focal" | "ambient" | "suppressed";
  /** Original namespace-derived package, preserved when `pkg` has been
   *  overridden with the file's functional-component name (fileGroups mode).
   *  Absent when no component override applied. */
  namespacePkg?: string;
}

export interface ParamLineageStep {
  nodeId: string; // flow node id where this step happens
  functionName: string;
  serviceId: string;
  action:
    | "origin"
    | "passthrough"
    | "validate"
    | "transform"
    | "extract"
    | "enrich";
  description: string; // what happens to the param at this step
  typeAtStep: string; // the type/shape at this point
}

export interface ParamLineage {
  paramName: string;
  steps: ParamLineageStep[];
}

export interface FlowNode {
  id: string;
  functionName: string;
  serviceId: string;
  packageName: string;
  fileName: string;
  role:
    | "entry-point"
    | "data-transformer"
    | "validator"
    | "error-handler"
    | "utility"
    | "orchestrator"
    | "event-handler"
    | "data-access";
  description: string;
  params: string;
  returnType: string;
  lines: number;
  paramLineage?: ParamLineage[];
}

export interface CrossModuleFlow {
  id: string;
  name: string;
  description: string;
  nodes: FlowNode[];
}

export interface PackageData {
  id: string;
  name: string;
  service: string;
  cx: number;
  cy: number;
  radius: number;
}
export interface SharedLib {
  id: string;
  name: string;
  consumedBy: string[];
  cx: number;
  cy: number;
  radius: number;
  seed: number;
  aiSummary?: string;
}

export interface Dependency {
  from: string;
  to: string;
  importCount: number;
  isViolation: boolean;
  label?: string;
  aiContext?: string;
}

export interface CallChainEntry {
  callers: Array<{
    fqn: string;
    functionName: string;
    service: string;
    file: string;
    callType?: string;
  }>;
  callees: Array<{
    fqn: string;
    functionName: string;
    service: string;
    file: string;
    callType?: string;
  }>;
}

export interface ComponentFunction {
  id: string;
  name: string;
  complexity: number; // 1-10
  lines: number;
  calls: string[]; // IDs of other functions it calls
  calledBy: string[]; // IDs of functions that call this one
  isPublic: boolean;
  returnType: string;
  params: string[];
  description: string;
  role: FunctionRole;
  importance: number; // 0-1, computed from centrality + public + complexity
  body?: string; // C# source code body, if available from analysis pipeline
}

/** The shape of the JSON file produced by export.clj after data-model normalization. */
export interface RawAnalysisJSON {
  isRealData: boolean;
  services: RawService[];
  sharedLibs: RawSharedLib[];
  dependencies: RawDependency[];
  files: Record<string, RawFile>; // keyed by path
  methods: Record<string, RawMethod>; // keyed by FQN
  calls: Record<string, string[]>; // FQN -> [FQN]
  journeys?: RawJourney[];
  crossServiceCalls?: CrossServiceCall[];
  crossModuleFlows?: CrossModuleFlow[];
  prOverlay?: unknown; // PR mode only — separate rich structure
  /** Journey-connection agent output (narrative, roles, links). */
  prOverview?: unknown;
  /** Journey-knowledge — per-journey, per-step Confluence docs + graph
   *  facts surfaced by the analyzer. */
  journeyKnowledge?: unknown;
  /** Staged analyzer session id (PR flow) — what interactive /bpmn/ask sends. */
  session_id?: string;
  /** Analyzer repo key — what specs/grouping were fetched under. */
  analyzerRepoId?: string;
  /** Module groups from the analyzer's grouping agent, baked in by the CLI. */
  groups?: import("./grouping").ServiceGroup[];
  /** Per-service functional-component partition from the file-grouping agent.
   *  When present, the canvas clusters files by component (not namespace
   *  package) and journey transit lines get component-granular stops. */
  fileGroups?: import("./grouping").ServiceFileGroups[];
  /** Living-specs bundle (list + history + version contents), baked in. */
  specs?: import("./specs").SpecsPayload;
  /** Correctness-audit findings from the analyzer's review agent, baked in. */
  findings?: import("./findings").FindingsPayload;
  /** Repository architecture diagram (component/integration graph), baked in. */
  architecture?: import("./architecture").ArchitecturePayload;
}
// ── Global method index ───────────────────────────────────────────
// Provides cross-file method lookup by FQN (the method's `id` field).

export interface MethodIndexEntry {
  name: string;
  fileId: string;
  filePath: string;
  service: string;
  importance: number;
  body?: string;
}
// methods: file-path → ComponentFunction[]
// calls: fqn → fqn[] (outgoing edges)
export interface AnalysisData {
  isRealData: boolean;
  services: MonoService[];
  sharedLibs: SharedLib[];
  dependencies: MonoDependency[];
  files: Record<string, MonoFile>;
  methods: Record<string, ComponentFunction[]>;
  calls: Record<string, string[]>;
  journeys: JourneyData[];
  crossServiceCalls: CrossServiceCall[];
  crossModuleFlows: CrossModuleFlow[];
  prOverlay?: PROverlayData;
}

export interface TransformedData extends AnalysisData {
  chapters: Chapter[];
  chapterById: Map<string, Chapter>;
  chapterBySlug: Map<string, Chapter>;
  journeyByFqn: Map<string, JourneyData[]>;
  journeyByEntry: Map<string, JourneyData>;
  functions: Record<string, ComponentFunction[]>;
  functionToChapters: Map<string, string[]>;
  serviceColors: Record<string, string>;
  callChainData: Record<string, CallChainEntry>;
  globalMethodIndex: Map<string, MethodIndexEntry>;
  prData?: PRData;
  // ── AI-enrichment overlays (parity with the webapp's dataLoader module
  // state). null when the corresponding key was absent from the raw JSON.
  prOverview: PrOverview | null;
  journeyKnowledge: JourneyKnowledgeResponse | null;
  /** Staged analyzer session id — what the Ask AI panel sends to /bpmn/ask. */
  sessionId?: string | null;
  /** Analyzer repo key the specs/grouping bundle was fetched under. */
  analyzerRepoId?: string | null;
  /** Positioned group hulls (grouping agent × client layout); null = none. */
  serviceGroups?: import("./grouping").PositionedGroupRegion[] | null;
  /** Per-service functional-component partition (verbatim from the payload);
   *  null = the run has no fileGroups. */
  fileGroups?: import("./grouping").ServiceFileGroups[] | null;
  /** filePath → the functional component it belongs to. Built from
   *  `fileGroups`; empty when the run has none. Consumers: the file→component
   *  cluster override and component-granular journey stops. */
  fileToComponent?: Map<string, import("./grouping").FileComponentRef>;
  /** Living-specs bundle embedded in the payload; null = not exported. */
  specs?: import("./specs").SpecsPayload | null;
  /** Correctness-audit findings; null = the run had no review enrichment. */
  findings?: import("./findings").FindingsPayload | null;
  /** Repository architecture diagram; null = the run had no architecture
   *  enrichment (no analyzer token, or the feature disabled). */
  architecture?: import("./architecture").ArchitecturePayload | null;

  packages?: Map<string, PackageData[]>; //serviceId:packageData
  anomalies: Anomaly[];
  PACKAGE_ROLES: Record<
    string,
    { role: string; confidence: "high" | "medium" }
  >;
}

// ---------------------------------------------------------------------------
// PR Overlay — merged into AnalysisData when PR mode was used
// ---------------------------------------------------------------------------

export interface PRSnapshot {
  id: string;
  fqn: string;
  name: string;
  class: string;
  file: string;
  service: string;
  change: ChangeType;
  significance: Significance;
  complexity: number;
  loc: number;
  /** Full parameterized FQN of the method this one REPLACED — present only
   * on renamed/moved records (backend rename lineage). Absent on old
   * payloads; consumers must treat it as optional. */
  oldFqn?: string | null;
}

export interface PREdgeDelta {
  id: string;
  change: ChangeType;
  fromFqn: string;
  toFqn: string;
  fromService: string;
  toService: string;
  crossService: boolean;
}

export interface PRTopImpactful {
  fqn: string;
  name: string;
  class: string;
  change: ChangeType;
  blast: number;
}

export interface PRSummary {
  added: number;
  modified: number;
  deleted: number;
  edgeDeltas: number;
  journeysAffected: number;
  journeysAdded: number;
  journeysRemoved: number;
  journeysDemoted: number;
  filesTouched: number;
  classesTouched: number;
  blastRadius: number;
  topImpactful: PRTopImpactful[];
}

export interface PROverlayData {
  /** PR id (e.g. number or auto-generated). Empty when not from a PR URL. */
  id?: string;
  baseSha: string;
  headSha: string;
  /** Head branch name. */
  branch: string;
  /** Base branch name (e.g. "main"). Only present when known — derived from
   *  the GitHub API for PR-URL analyses, or from `git merge-base` heuristics
   *  for raw-SHA analyses that auto-detect main/master. */
  baseBranch?: string;
  title: string;
  /** Only set when the analysis was driven from a PR URL. */
  author?: string;
  /** PR state: "open" / "closed" / "merged". Only with PR URL. */
  state?: string;
  /** Only with PR URL (e.g. "owner/repo"). */
  baseRepo?: string;
  headRepo?: string;
  /** GitHub-reported PR target tip (the SHA the PR is "merging into" per the
   *  PR API). Only emitted when this differs from `baseSha` — i.e. when the
   *  analyser switched anchor from pr.base.sha to the merge-base because the
   *  PR is behind main. UI can render a "PR is N commits behind main"
   *  indicator when both `prTargetSha` and `behindBy` are present. */
  prTargetSha?: string;
  /** Number of commits the PR target is ahead of the merge-base
   *  (i.e. how stale the PR's base branch reference is). Only emitted
   *  alongside `prTargetSha`. */
  behindBy?: number;
  summary: {
    added: number;
    modified: number;
    deleted: number;
    edgeDeltas: number;
    journeysAffected: number;
    journeysAdded: number;
    journeysRemoved: number;
    filesTouched: number;
    classesTouched: number;
    blastRadius: number;
    topImpactful: {
      fqn: string;
      name: string;
      class: string;
      change: string;
      blast: number;
    }[];
  };
  snapshots: PRSnapshot[];
  snapshotsByFile: Record<
    string,
    { name: string; change: string; significance: string }[]
  >;
  edgeDeltas: PREdgeDelta[];
}
export interface PRData {
  title: string;
  filesModified: string[];
  filesAdded: string[];
  filesDeleted: string[];
  ghostCandidates: string[];
  semanticGhosts: string[];
  newViolation: { from: string; to: string };
  aiNarrative: string;
  tourSteps: { target: string; note: string }[];
}
// ---------------------------------------------------------------------------
// API request / response types — IPC bridge contract
// ---------------------------------------------------------------------------

export interface AnalyzeRequest {
  input: string;
  lang?: "java" | "csharp";
  module?: string;
  output?: string;
  sourceRoots?: string[];
  sln?: string;
}

export interface PRAnalyzeRequest {
  input: string;
  base?: string;
  head?: string;
  lang?: "java" | "csharp";
  sln?: string;
  module?: string;
  prTitle?: string;
  /** Override the analyzer repo_id (the stable knowledge-base key). When set,
   *  the backend uses it instead of deriving one from the input path/URL. */
  repoId?: string;
}

export interface StartJobResponse {
  jobId: string;
}

export type JobStatus =
  | "pending"
  | "running"
  | "complete"
  | "error"
  | "cancelled"
  | "module-required"
  | "sln-required";

export interface JobEvent {
  jobId: string;
  phase: string;
  message: string;
  percent: number;
}

export interface JobCompleteEvent {
  jobId: string;
  outputPath: string;
}

export interface JobErrorEvent {
  jobId: string;
  error: string;
}

export interface JobModuleRequiredEvent {
  jobId: string;
  modules: string[];
  message: string;
}

export interface JobSlnRequiredEvent {
  jobId: string;
  slns: string[];
  message: string;
}

// Discriminated union for SSE events
export type AnalysisEvent =
  | { type: "progress"; data: JobEvent }
  | { type: "complete"; data: JobCompleteEvent }
  | { type: "error"; data: JobErrorEvent }
  | { type: "module-required"; data: JobModuleRequiredEvent }
  | { type: "sln-required"; data: JobSlnRequiredEvent };

// ---------------------------------------------------------------------------
// Run manifest — the manifest.json sidecar written per run dir (see backend
// run_manifest.clj). The Library lists runs from these summaries without
// parsing multi-MB output JSONs.
// ---------------------------------------------------------------------------

export interface RunManifestFlow {
  journeyId: string;
  title: string;
}

export interface RunManifest {
  kind: "pr" | "analyze";
  project: string;
  timestamp: string;
  generatedAt?: string;
  prNumber?: number;
  prTitle?: string;
  prAuthor?: string;
  branch?: string;
  baseSha?: string;
  headSha?: string;
  repoUrl?: string;
  durationMs?: number;
  counts: {
    journeys: number;
    bpmn: number;
    summaries: number;
  };
  bpmnFlows: RunManifestFlow[];
  overviewExcerpt: string | null;
}

export interface RunInfo {
  runId: string;
  project: string;
  outputPath: string;
  createdAt: string;
  /** Which artifact this run produced (pr-output.json vs output.json). */
  kind?: "pr" | "analyze";
  /** Sidecar summary — null when the output JSON couldn't be parsed. */
  manifest?: RunManifest | null;
}

// ---------------------------------------------------------------------------
// IPC channel names (keep in sync with electron/analysis-ipc.ts)
// ---------------------------------------------------------------------------

export const IPC = {
  START_ANALYSIS: "analysis:start",
  START_PR_ANALYSIS: "analysis:start-pr",
  CANCEL_JOB: "analysis:cancel",
  LIST_RUNS: "analysis:list-runs",
  LOAD_RUN: "analysis:load-run",
  SUBSCRIBE_EVENTS: "analysis:subscribe-events",
  EXPORT_SESSION: "export-session",
  IMPORT_SESSION: "import-session",
} as const;

// Session bundle export/import results (see electron/analysis-ipc.ts).
export type ExportSessionResult =
  | { ok: true; path: string }
  | { ok: false; canceled: true }
  | { ok: false; error: string };

export type ImportSessionResult =
  | { ok: true; outputPath: string; project: string }
  | { ok: false; canceled: true }
  | { ok: false; error: string };

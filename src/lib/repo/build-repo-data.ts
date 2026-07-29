import type { TransformedData } from "@/types/analysis";
import type { RepoManifest } from "@/types/repo-manifest";

/** Repo mode reuses the existing report pages (Architecture, Specs) verbatim by
 *  loading a SYNTHETIC report into the analysis store: every code-graph
 *  collection is empty, and only the repo-level artifacts (architecture,
 *  specs) plus the repo key are populated. The Architecture and Specs pages
 *  read those keys straight from the store, so the GLOBAL diagram and the
 *  GLOBAL living specs render with zero page-specific code and guaranteed
 *  visual parity with per-PR reports. Journeys / Canvas / Findings are empty
 *  and the rail hides them in repo mode. */
export function buildRepoModeData(manifest: RepoManifest): TransformedData {
  return {
    isRealData: true,
    services: [],
    sharedLibs: [],
    dependencies: [],
    files: {},
    methods: {},
    calls: {},
    journeys: [],
    crossServiceCalls: [],
    crossModuleFlows: [],

    chapters: [],
    chapterById: new Map(),
    chapterBySlug: new Map(),
    journeyByFqn: new Map(),
    journeyByEntry: new Map(),
    functions: {},
    functionToChapters: new Map(),
    serviceColors: {},
    callChainData: {},
    globalMethodIndex: new Map(),
    prOverview: null,
    journeyKnowledge: null,
    anomalies: [],
    PACKAGE_ROLES: {},

    analyzerRepoId: manifest.repo,
    architecture: manifest.architecture ?? null,
    specs: manifest.specs ?? null,
    findings: null,
  };
}

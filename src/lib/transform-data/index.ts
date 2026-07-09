import {
  PackageData,
  PROverlayData,
  RawAnalysisJSON,
  TransformedData,
} from "@/types/analysis";
import {
  JourneyKnowledgeResponse,
  PrOverview,
} from "@/types/intent";
import { buildCallChainData, buildMethodIndex } from "./call-graph";
import {
  buildFileToComponent,
  componentPackagesByService,
} from "./file-groups";
import { transformFiles, transformFunctions } from "./files";
import { transformChapters, transformJourneys } from "./journeys";
import { prOverlayToPRData, setPROverlay } from "./pr-overlay";
import {
  buildServiceColors,
  transformDependencies,
  transformServices,
  transformSharedLibs,
} from "./services";
import { deriveAnomalies, derivePackageRoles } from "./derive-data";
import { applyOrderedLayout } from "../canvas/ordered-layout";
import type { PackageSize } from "../canvas/ordered-layout";
import { getPackagePositions } from "../canvas/get-positions";

// ── Main loader ────────────────────────────────────────────────────

export function transformToFrontendFormat(
  raw: RawAnalysisJSON
): TransformedData {
  let services = transformServices(raw.services || []);
  const methods = raw.methods || {};
  const calls = raw.calls || {};
  const files = raw.files || {};
  const journeys = raw.journeys || [];
  const functions = transformFunctions(methods, calls, files);

  // Functional components (sub-service file grouping). When the payload carries
  // `fileGroups`, override each file's cluster key (pkg) with its component
  // NAME and each service's package list with the component-name list — the
  // package grid then renders functional components, and journey transit lines
  // can resolve component-granular stops. No-op when absent: the map is empty,
  // transformFiles skips the override, packages stay namespace-derived.
  //
  // This runs BEFORE the ordered layout: the layout sizes each service radius
  // from its package grid, so the (possibly component-overridden) package list
  // and per-package file counts must be final first (sizes cascade bottom-up:
  // packages → service radius → group hull → column layout).
  const rawFileGroups = raw.fileGroups ?? null;
  const fileToComponent = buildFileToComponent(rawFileGroups);
  if (rawFileGroups && rawFileGroups.length > 0 && fileToComponent.size > 0) {
    const pkgsByService = componentPackagesByService(
      files,
      rawFileGroups,
      fileToComponent
    );
    services = services.map((s) =>
      pkgsByService.has(s.id) ? { ...s, packages: pkgsByService.get(s.id)! } : s
    );
  }

  // Final per-file cluster keys (namespace pkg, or component name in fileGroups
  // mode). Built once here and reused as transformedData.files — it's both the
  // canvas file source AND the source of truth for package file counts.
  const transformedFiles = transformFiles(files, fileToComponent);

  // Package file counts, keyed service → package → count. Feeds two consumers
  // that MUST agree: the ordered layout (to grow service radii) and
  // getPackagePositions (to place the blobs). The live store isn't populated
  // yet during this transform, so counts come from transformedFiles, not the
  // store-backed getPackageFiles.
  const fileCounts = new Map<string, Map<string, number>>();
  for (const file of Object.values(transformedFiles)) {
    let perPkg = fileCounts.get(file.service);
    if (!perPkg) fileCounts.set(file.service, (perPkg = new Map()));
    perPkg.set(file.pkg, (perPkg.get(file.pkg) ?? 0) + 1);
  }
  const fileCountOf = (serviceId: string, pkg: string): number =>
    fileCounts.get(serviceId)?.get(pkg) ?? 0;

  const dependencies = transformDependencies(raw.dependencies || []);

  // Module groups (grouping agent, baked into the payload by the CLI): draw the
  // canvas as an ordered, grid-aligned architectural diagram — dependency
  // direction picks columns (importers left of what they import), groups stack
  // in columns, services grid inside hulls, packages grid inside services. The
  // engine grows service radii to contain their grids and returns positioned
  // hulls. No groups → old behaviour untouched (services keep backend cx/cy).
  let serviceGroups: TransformedData["serviceGroups"] = null;
  if (raw.groups?.length) {
    const packagesByService = new Map<string, PackageSize[]>(
      services.map((s) => [
        s.id,
        s.packages.map((name) => ({ name, fileCount: fileCountOf(s.id, name) })),
      ])
    );
    const laid = applyOrderedLayout(
      services,
      raw.groups,
      dependencies,
      packagesByService
    );
    services = laid.services;
    serviceGroups = laid.groupRegions;
  }

  // Build FQN-keyed indexes and the canvas call-chain view from the new shape.
  const globalMethodIndex = buildMethodIndex(methods, files);
  let prOverlayData: PROverlayData = null;
  if (raw.prOverlay) {
    prOverlayData = setPROverlay(raw.prOverlay);
  }
  // Hydrate journey/chapter stores. Both consume the same RawJourney records.
  const transformedData: TransformedData = {
    services,
    sharedLibs: transformSharedLibs(raw.sharedLibs || []),
    dependencies,
    files: transformedFiles,
    functions,
    serviceColors: buildServiceColors(services),
    isRealData: raw.isRealData ?? true,
    crossServiceCalls: raw.crossServiceCalls,
    crossModuleFlows: raw.crossModuleFlows,
    callChainData: buildCallChainData(calls, methods, files),
    prOverlay: prOverlayData,
    globalMethodIndex,
    methods: functions,
    calls: calls,
    journeys: [],
    journeyByEntry: new Map(),
    journeyByFqn: new Map(),
    functionToChapters: new Map(),
    chapters: [],
    chapterById: new Map(),
    chapterBySlug: new Map(),
    anomalies: [],
    PACKAGE_ROLES: {},
    prData: prOverlayToPRData(prOverlayData, methods),
    prOverview: null,
    journeyKnowledge: null,
    serviceGroups,
    fileGroups: rawFileGroups,
    fileToComponent,
  };

  // ── AI-enrichment overlays (parity with the webapp dataLoader) ──────

  // PR Overview — journey-connection agent (narrative, roles, links).
  const rawPrOverview = raw.prOverview;
  if (rawPrOverview && typeof rawPrOverview === "object") {
    transformedData.prOverview = rawPrOverview as PrOverview;
    console.info(
      `[dataLoader] PR overview loaded: ${transformedData.prOverview.journeys?.length ?? 0} roles, ${transformedData.prOverview.links?.length ?? 0} links`
    );
  }

  // Journey knowledge — per-journey, per-step Confluence docs + graph facts.
  // Read as-is (snake_case wire shape).
  transformedData.journeyKnowledge =
    (raw.journeyKnowledge as JourneyKnowledgeResponse) ?? null;
  // Staged analyzer session id — lets interactive /bpmn/ask resolve the same
  // journey + sources server-side.
  transformedData.sessionId = raw.session_id ?? null;

  // Analyzer repo key + baked-in analyzer bundles (specs, module groups).
  transformedData.analyzerRepoId = raw.analyzerRepoId ?? null;
  transformedData.specs = raw.specs ?? null;
  transformedData.findings = raw.findings ?? null;
  transformedData.architecture = raw.architecture ?? null;

  if (journeys.length > 0) {
    const {
      journeys: transformedJourneys,
      journeyByFqn,
      journeyByEntry,
    } = transformJourneys(journeys, methods, files);
    transformedData["journeys"] = transformedJourneys;
    transformedData["journeyByEntry"] = journeyByEntry;
    transformedData["journeyByFqn"] = journeyByFqn;
    const { chapters, chapterById, chapterBySlug, functionToChapters } =
      transformChapters(journeys, methods, files, calls);
    transformedData["chapters"] = chapters;
    transformedData["chapterById"] = chapterById;
    transformedData["chapterBySlug"] = chapterBySlug;
    transformedData["functionToChapters"] = functionToChapters;
  }

  const filesList = Object.values(transformedData?.files || {});
  transformedData["anomalies"] = deriveAnomalies(
    transformedData.services,
    filesList,
    transformedData.dependencies
  );

  transformedData["PACKAGE_ROLES"] = derivePackageRoles({
    services: transformedData.services,
    dependencies: transformedData.dependencies,
    files: filesList,
  });

  // Package blob positions. Uses the SAME file counts the ordered layout used
  // to grow service radii (not the yet-unpopulated store), so the stored
  // positions match what the canvas renders and journey transit-line anchors
  // land on the right component blobs.
  const packages = new Map<string, PackageData[]>();
  services.forEach((service) => {
    packages.set(service.id, getPackagePositions(service, fileCountOf));
  });
  transformedData["packages"] = packages;

  // PR overlay (separate rich PR structure — independent of prChanges).
  console.info(
    "[dataLoader] raw.prOverlay:",
    raw.prOverlay ? "present" : "MISSING"
  );

  return transformedData;
}

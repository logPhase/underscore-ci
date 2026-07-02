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
import { getPackagePositions } from "../canvas/get-positions";

// ── Main loader ────────────────────────────────────────────────────

export function transformToFrontendFormat(
  raw: RawAnalysisJSON
): TransformedData {
  const services = transformServices(raw.services || []);
  const methods = raw.methods || {};
  const calls = raw.calls || {};
  const files = raw.files || {};
  const journeys = raw.journeys || [];
  const functions = transformFunctions(methods, calls, files);

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
    dependencies: transformDependencies(raw.dependencies || []),
    files: transformFiles(files),
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
    prData: prOverlayToPRData(prOverlayData),
    prOverview: null,
    journeyKnowledge: null,
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

  const packages = new Map<string, PackageData[]>();

  services.map((service) => {
    const pkg = getPackagePositions(service);
    packages.set(service.id, pkg);
  });
  transformedData["packages"] = packages;

  // PR overlay (separate rich PR structure — independent of prChanges).
  console.info(
    "[dataLoader] raw.prOverlay:",
    raw.prOverlay ? "present" : "MISSING"
  );

  return transformedData;
}

/**
 * city-data — adapt the report's transformed payload into a Code City model:
 * districts (module groups), buildings (files), and routes (journeys walked
 * through the city). Pure data massage over what the analyzer already baked —
 * no backend call, no new payload key. The heavy lifting (deterministic
 * positions) is `buildCity` in city-layout.
 */
import {
  buildCity,
  type CityBuilding,
  type CityDistrictInput,
  type CityFileInput,
  type CityLayout,
} from "./city-layout";

// Minimal, defensive views of the payload — we read only load-bearing fields
// (the rest of MonoFile is hardcoded zeros; see the transform layer).
interface FileLike {
  path: string;
  name?: string;
  service?: string;
  pkg?: string;
  sizeLines?: number;
  semanticRole?: string;
  importance?: number;
  isEntryPoint?: boolean;
}
interface JourneyStepLike {
  file?: string;
  prStatus?: string;
}
interface JourneyLike {
  id: string;
  title: string;
  steps?: JourneyStepLike[];
  status?: string;
  prStatus?: string;
  handlerType?: string;
}
interface TransformedLike {
  files?: Record<string, FileLike>;
  journeys?: JourneyLike[];
  analyzerRepoId?: string;
}

/** A journey drawn as an ordered path of buildings through the city. */
export interface CityRoute {
  id: string;
  title: string;
  handlerType?: string;
  status?: string;
  prStatus?: string;
  /** Ordered building ids (file paths) that actually exist in the city. */
  buildingIds: string[];
}

export interface CityModel {
  layout: CityLayout;
  routes: CityRoute[];
  buildingById: Map<string, CityBuilding>;
  repoId: string;
  stats: { districts: number; buildings: number; files: number; routes: number };
}

/** Last path segment, sans extension — the readable building label. */
function baseName(path: string): string {
  const seg = path.split(/[\\/]/).pop() ?? path;
  return seg.replace(/\.[^.]+$/, "");
}

/** Prettify a long service id (e.g. "IRIS.VAS.Application" → "Application"). */
function districtLabel(key: string): string {
  const dot = key.split(".").filter(Boolean).pop();
  return dot ?? key;
}

/**
 * Build the city model, or null when there's nothing to draw. Districts are
 * the natural module grain: services when the repo has several, otherwise the
 * finer package/component grouping so a single-service repo still becomes a
 * city of neighbourhoods rather than one block.
 */
export function buildCityModel(transformed: TransformedLike | null | undefined): CityModel | null {
  const filesMap = transformed?.files;
  if (!filesMap) return null;
  const files = Object.values(filesMap).filter((f) => f && f.path);
  if (files.length === 0) return null;

  const serviceOf = (f: FileLike) => (f.service && f.service.trim()) || "app";
  const pkgOf = (f: FileLike) => (f.pkg && f.pkg.trim()) || serviceOf(f);
  const distinctServices = new Set(files.map(serviceOf));
  const keyOf = distinctServices.size >= 2 ? serviceOf : pkgOf;

  // Group files into districts by the chosen key.
  const groups = new Map<string, CityFileInput[]>();
  for (const f of files) {
    const key = keyOf(f);
    const arr = groups.get(key) ?? [];
    arr.push({
      id: f.path,
      name: f.name || baseName(f.path),
      lines: Math.max(0, Math.round(f.sizeLines ?? 0)),
      role: f.semanticRole || "service",
      importance: f.importance ?? 0,
      isEntryPoint: !!f.isEntryPoint,
    });
    groups.set(key, arr);
  }

  const districtInputs: CityDistrictInput[] = [...groups.entries()].map(
    ([id, groupFiles]) => ({ id, name: districtLabel(id), files: groupFiles })
  );

  const layout = buildCity(districtInputs);
  const buildingById = new Map(layout.buildings.map((b) => [b.id, b]));

  // Journeys → routes: keep each step's resolved file when it maps to a
  // building, collapse consecutive repeats, and keep only routes that visit
  // at least two distinct buildings (a single dot isn't a path).
  const routes: CityRoute[] = [];
  for (const j of transformed?.journeys ?? []) {
    const ids: string[] = [];
    for (const s of j.steps ?? []) {
      const f = s.file;
      if (f && buildingById.has(f) && ids[ids.length - 1] !== f) ids.push(f);
    }
    if (new Set(ids).size >= 2) {
      routes.push({
        id: j.id,
        title: j.title,
        handlerType: j.handlerType,
        status: j.status,
        prStatus: j.prStatus,
        buildingIds: ids,
      });
    }
  }

  return {
    layout,
    routes,
    buildingById,
    repoId: transformed?.analyzerRepoId || "repo",
    stats: {
      districts: layout.districts.length,
      buildings: layout.buildings.length,
      files: files.length,
      routes: routes.length,
    },
  };
}

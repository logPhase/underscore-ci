/**
 * city-data — adapt the report's transformed payload into a Code City model:
 * districts (module groups), buildings (the IMPORTANT / affected files, not
 * every file), routes (PR-affected journeys walked through the city), and PR
 * status (which buildings the PR touched). Pure data massage over what the
 * analyzer already baked — no backend call, no new payload key.
 */
import {
  buildCity,
  type CityBuilding,
  type CityDistrictInput,
  type CityFileInput,
  type CityLayout,
} from "./city-layout";

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
}
interface JourneyLike {
  id: string;
  title: string;
  steps?: JourneyStepLike[];
  status?: string;
  prStatus?: string;
  handlerType?: string;
}
interface PRDataLike {
  title?: string;
  filesModified?: string[];
  filesAdded?: string[];
  filesDeleted?: string[];
  ghostCandidates?: string[];
}
interface GroupRegionLike {
  id: string;
  name: string;
  serviceIds?: string[];
}
interface TransformedLike {
  files?: Record<string, FileLike>;
  journeys?: JourneyLike[];
  prData?: PRDataLike | null;
  /** The module grouper's output — clusters services into named groups. When
   *  present, these become the city's districts (fewer, more meaningful). */
  serviceGroups?: GroupRegionLike[] | null;
  analyzerRepoId?: string;
}

/** Full city never shows every file — only the ~this-many most important, so a
 *  600-file repo reads as a legible skyline. Affected + entry-point + on-journey
 *  files are always kept on top of this budget. */
const CITY_BUILDING_BUDGET = 150;

/** A journey drawn as an ordered path of buildings through the city. */
export interface CityRoute {
  id: string;
  title: string;
  handlerType?: string;
  status?: string;
  prStatus?: string;
  /** True when this journey is part of the PR (analyzer-flagged, or it visits a
   *  changed building) — the only journeys we surface on a PR report. */
  affected: boolean;
  buildingIds: string[];
}

export interface CityPR {
  title: string;
  modified: Set<string>;
  added: Set<string>;
  deleted: Set<string>;
  ghost: Set<string>;
  changed: Set<string>;
  count: number;
}

export interface CityModel {
  layout: CityLayout;
  routes: CityRoute[];
  buildingById: Map<string, CityBuilding>;
  pr: CityPR | null;
  repoId: string;
  stats: { districts: number; buildings: number; files: number; shown: number; routes: number };
}

/** Map the analyzer's free-form semantic role to the reference's 7 roles. */
const ROLE_RULES: [RegExp, string][] = [
  [/endpoint|controller|\bapi\b|route|rest|graphql/i, "controller"],
  [/repository|persistence|\bdata\b|\bdao\b|\bdb\b|migration|kafka|cache|adapter|broker|storage|infra/i, "infrastructure"],
  [/test|spec|fixture/i, "test"],
  [/model|entity|\bdto\b|record|schema|domain|aggregate|value.?object/i, "model"],
  [/config|setting|startup|program|bootstrap|wiring|module|option/i, "config"],
  [/util|helper|mapper|extension|common|shared/i, "utility"],
  [/service|business|logic|usecase|use-case|application|handler|processor|manager|worker/i, "service"],
];
function mapRole(semanticRole: string | undefined): string {
  const r = semanticRole || "";
  for (const [re, role] of ROLE_RULES) if (re.test(r)) return role;
  return "service";
}

function baseName(path: string): string {
  const seg = path.split(/[\\/]/).pop() ?? path;
  return seg.replace(/\.[^.]+$/, "");
}
function districtLabel(key: string): string {
  return key.split(".").filter(Boolean).pop() ?? key;
}

export function buildCityModel(transformed: TransformedLike | null | undefined): CityModel | null {
  const filesMap = transformed?.files;
  if (!filesMap) return null;
  const files = Object.values(filesMap).filter((f) => f && f.path);
  if (files.length === 0) return null;

  const serviceOf = (f: FileLike) => (f.service && f.service.trim()) || "app";
  const pkgOf = (f: FileLike) => (f.pkg && f.pkg.trim()) || serviceOf(f);

  // District grouping — prefer the module grouper's serviceGroups.
  let keyOf: (f: FileLike) => string;
  let labelOf: (key: string) => string;
  const groupsMeta = transformed?.serviceGroups;
  if (groupsMeta && groupsMeta.length) {
    const svcToGroup = new Map<string, string>();
    for (const g of groupsMeta) for (const s of g.serviceIds ?? []) svcToGroup.set(s, g.id);
    const nameById = new Map(groupsMeta.map((g) => [g.id, g.name]));
    keyOf = (f) => svcToGroup.get(serviceOf(f)) ?? serviceOf(f);
    labelOf = (key) => nameById.get(key) ?? districtLabel(key);
  } else {
    const distinct = new Set(files.map(serviceOf));
    keyOf = distinct.size >= 2 ? serviceOf : pkgOf;
    labelOf = districtLabel;
  }

  // PR-affected file sets — always kept regardless of thinning.
  const pd = transformed?.prData;
  const modified = new Set(pd?.filesModified ?? []);
  const added = new Set(pd?.filesAdded ?? []);
  const deleted = new Set(pd?.filesDeleted ?? []);
  const ghost = new Set(pd?.ghostCandidates ?? []);
  const affected = new Set<string>([...modified, ...added, ...deleted]);

  // A journey is "part of the PR" by the analyzer's own flag when it sets one
  // (authoritative — a widely-used DI file shouldn't drag in every journey);
  // otherwise fall back to "visits a changed file".
  const allJourneys = transformed?.journeys ?? [];
  const journeysFlagged = allJourneys.some((j) => !!j.prStatus);
  const isJourneyAffected = (j: JourneyLike, stepFiles: string[]) =>
    journeysFlagged ? !!j.prStatus : stepFiles.some((f) => affected.has(f));

  // Keep the files an AFFECTED journey needs so its overlay can be drawn. We
  // deliberately do NOT pin every journey's files — that's what turns a big
  // repo back into a wall. Journeys that survive the importance thinning are
  // still walkable; the rest simply aren't part of this PR's story.
  const hasPR = affected.size > 0;
  const journeyFiles = new Set<string>();
  if (hasPR) {
    for (const j of allJourneys) {
      const stepFiles = (j.steps ?? []).map((s) => s.file).filter((f): f is string => !!f);
      if (isJourneyAffected(j, stepFiles)) for (const f of stepFiles) journeyFiles.add(f);
    }
  }

  // Group files into districts.
  const groups = new Map<string, { label: string; files: CityFileInput[] }>();
  for (const f of files) {
    const key = keyOf(f);
    const g = groups.get(key) ?? { label: labelOf(key), files: [] };
    g.files.push({
      id: f.path,
      name: f.name || baseName(f.path),
      lines: Math.max(0, Math.round(f.sizeLines ?? 0)),
      role: mapRole(f.semanticRole),
      importance: f.importance ?? 0,
      isEntryPoint: !!f.isEntryPoint,
    });
    groups.set(key, g);
  }

  // Thin each district to its most important classes, but always keep entry
  // points, affected files, and journey files.
  const total = files.length;
  const prom = (f: CityFileInput) => (f.isEntryPoint ? 1000 : 0) + f.importance * 10 + f.lines / 50;
  const districtInputs: CityDistrictInput[] = [...groups.entries()]
    .map(([id, g]) => {
      const K = Math.max(6, Math.round((g.files.length * CITY_BUILDING_BUDGET) / total));
      const ranked = [...g.files].sort((a, b) => prom(b) - prom(a));
      const keep = new Set(ranked.slice(0, K).map((f) => f.id));
      // Entry-point-ness is already the dominant term in `prom`, so the top-K
      // captures the important ones — we only FORCE-keep things the top-K might
      // miss but that must appear: PR-touched files and affected-journey stops.
      for (const f of g.files) if (affected.has(f.id) || ghost.has(f.id) || journeyFiles.has(f.id)) keep.add(f.id);
      return { id, name: g.label, files: g.files.filter((f) => keep.has(f.id)) };
    })
    .filter((d) => d.files.length);

  const layout = buildCity(districtInputs);
  const buildingById = new Map(layout.buildings.map((b) => [b.id, b]));

  // PR status annotation.
  let pr: CityPR | null = null;
  if (pd) {
    for (const b of layout.buildings) {
      if (added.has(b.id)) b.prStatus = "added";
      else if (modified.has(b.id)) b.prStatus = "modified";
      else if (deleted.has(b.id)) b.prStatus = "deleted";
      else if (ghost.has(b.id)) b.prStatus = "ghost";
    }
    const changed = new Set<string>([...affected].filter((p) => buildingById.has(p)));
    if (changed.size > 0 || ghost.size > 0) {
      pr = { title: pd.title || "PR changes", modified, added, deleted, ghost, changed, count: changed.size };
    }
  }

  // Journeys → routes; flag the ones that are part of the PR.
  const routes: CityRoute[] = [];
  for (const j of transformed?.journeys ?? []) {
    const ids: string[] = [];
    for (const s of j.steps ?? []) {
      const f = s.file;
      if (f && buildingById.has(f) && ids[ids.length - 1] !== f) ids.push(f);
    }
    if (new Set(ids).size >= 2) {
      const isAffected = isJourneyAffected(j, (j.steps ?? []).map((s) => s.file).filter((f): f is string => !!f));
      routes.push({ id: j.id, title: j.title, handlerType: j.handlerType, status: j.status, prStatus: j.prStatus, affected: isAffected, buildingIds: ids });
    }
  }

  return {
    layout,
    routes,
    buildingById,
    pr,
    repoId: transformed?.analyzerRepoId || "repo",
    stats: {
      districts: layout.districts.length,
      buildings: layout.buildings.length,
      files: files.length,
      shown: layout.buildings.length,
      routes: routes.length,
    },
  };
}

/**
 * city-layout — a deterministic layout for the Code City, matched to the
 * agent-symphony reference: module groups become SPACED district islands with
 * generous streets between them (not a wall of blocks), and files become
 * buildings gridded inside their district with room to breathe.
 *
 * The report is a STATIC artifact (no backend at view time), so the city is
 * laid out client-side — but deterministically: the same repository always
 * produces the same city (the project's #1 principle — a stable base map that
 * never jitters). Every list is sorted by a stable key before layout, so order
 * of input never changes the result.
 *
 * Sizing mirrors the reference: a district's footprint grows with its file
 * count; a building's footprint grows gently with its lines and its HEIGHT
 * grows with lines (sqrt-compressed, reference-scaled so the skyline reads like
 * buildings, not spikes). Buildings sit at ~0.7 of their grid cell so streets
 * show between them.
 */

export type LandmarkType = "skyscraper" | "tower" | "gate" | "silo" | "facility";

/** A file to place as a building. */
export interface CityFileInput {
  id: string; // stable key (the file path) — also the tie-break sort key
  name: string;
  lines: number;
  role: string; // mapped FileRole (controller|service|model|utility|test|config|infrastructure)
  importance: number;
  isEntryPoint: boolean;
}

/** A module group to place as a district, carrying its files. */
export interface CityDistrictInput {
  id: string; // stable key
  name: string;
  files: CityFileInput[];
}

export interface CityBuilding {
  id: string;
  name: string;
  districtId: string;
  /** Footprint centre (x,z); the box sits on the ground (base y=0). */
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  lines: number;
  role: string;
  importance: number;
  isLandmark: boolean;
  landmarkType?: LandmarkType;
  /** Set by the data adapter when the file is touched by the PR. */
  prStatus?: "modified" | "added" | "deleted" | "ghost";
}

export interface CityDistrict {
  id: string;
  name: string;
  color: string;
  /** Ground rectangle (top-left x,z + size). */
  x: number;
  z: number;
  width: number;
  depth: number;
  buildingCount: number;
  totalLines: number;
}

export interface CityLayout {
  districts: CityDistrict[];
  buildings: CityBuilding[];
  /** Half-extent of the whole city (max |x|,|z|) — for camera framing. */
  extent: number;
}

/**
 * District tints — the reference's clean, saturated role-ish palette, cycled by
 * the district's sorted index so the same repo always colours the same way.
 */
const DISTRICT_COLORS = [
  "#e87461", // coral
  "#4a9ead", // teal
  "#7c5cbf", // indigo
  "#e879a0", // rose
  "#f59e0b", // amber
  "#4ade80", // green
  "#60a5fa", // blue
  "#a78bfa", // violet
  "#f472b6", // pink
  "#34d399", // emerald
];

const byId = <T extends { id: string }>(a: T, b: T) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Building height from lines — sqrt-compressed, reference-scaled (short-ish,
 *  so footprints and heights stay in the reference's proportion). */
function heightForLines(lines: number): number {
  return Math.min(11, 0.7 + Math.sqrt(Math.max(0, lines)) * 0.38);
}

/** A landmark's archetype from the file's nature — for varied silhouettes
 *  (skyscraper / tower / gate / silo), like the reference's church-spires. */
function landmarkTypeFor(f: CityFileInput): LandmarkType {
  const r = f.role.toLowerCase();
  if (r.includes("infra") || r.includes("data") || r.includes("repos")) return "silo";
  if (f.isEntryPoint || r.includes("controller") || r.includes("endpoint")) return "gate";
  if (r.includes("service") || r.includes("handler")) return "skyscraper";
  return "tower";
}

/**
 * Compose the city. Districts are placed in a grid of cells sized to the
 * LARGEST district plus a street gap, each district centred in its cell — so
 * smaller districts get extra plaza around them and the whole thing reads as
 * spaced islands. Buildings are gridded inside each district at ~0.7 of their
 * cell. Deterministic throughout.
 */
export function buildCity(districtInputs: CityDistrictInput[]): CityLayout {
  const districts = [...districtInputs].sort(byId).filter((d) => d.files.length);
  if (districts.length === 0) return { districts: [], buildings: [], extent: 10 };

  // Size each district by its file count (reference feel: sqrt of count).
  const sized = districts.map((d) => ({
    d,
    side: Math.min(30, Math.max(7, 4 + Math.sqrt(d.files.length) * 2.3)),
  }));

  // Shelf-pack districts left→right, wrapping rows — a COMPACT city with thin
  // streets, not a sparse grid of huge uniform cells. Compactness matters: a PR
  // that touches many districts must still frame tight, not zoom out to a field
  // of specks. Deterministic (districts already sorted by id).
  const GAP = 2.5; // street width between district islands
  const areaSum = sized.reduce((s, x) => s + x.side * x.side, 0);
  const targetW = Math.max(Math.max(...sized.map((s) => s.side)), Math.sqrt(areaSum) * 1.35);
  const packed: { d: CityDistrictInput; side: number; px: number; pz: number }[] = [];
  let curX = 0, curZ = 0, rowDepth = 0, maxX = 0;
  for (const { d, side } of sized) {
    if (curX > 0 && curX + side > targetW) { curZ += rowDepth + GAP; curX = 0; rowDepth = 0; }
    packed.push({ d, side, px: curX, pz: curZ });
    curX += side + GAP;
    rowDepth = Math.max(rowDepth, side);
    maxX = Math.max(maxX, curX - GAP);
  }
  const totalW = maxX;
  const totalD = curZ + rowDepth;

  const outDistricts: CityDistrict[] = [];
  const outBuildings: CityBuilding[] = [];
  let extent = 0;

  packed.forEach(({ d, side, px, pz }, i) => {
    const dx = px - totalW / 2; // district top-left, whole city centred on origin
    const dz = pz - totalD / 2;

    const totalLines = d.files.reduce((s, f) => s + Math.max(1, f.lines), 0);
    outDistricts.push({
      id: d.id,
      name: d.name,
      color: DISTRICT_COLORS[i % DISTRICT_COLORS.length],
      x: dx,
      z: dz,
      width: side,
      depth: side,
      buildingCount: d.files.length,
      totalLines,
    });

    // Landmark = the highest-prominence file in the district (entry points win,
    // then importance, then size). One spire per district keeps orientation
    // legible without clutter.
    const files = [...d.files].sort(byId);
    const prominence = (f: CityFileInput) =>
      (f.isEntryPoint ? 1000 : 0) + (f.importance ?? 0) * 10 + f.lines / 100;
    let landmarkId: string | null = null;
    let best = -Infinity;
    for (const f of files) {
      const p = prominence(f);
      if (p > best) { best = p; landmarkId = f.id; }
    }

    // Grid the buildings inside the district with margins → streets.
    const n = files.length;
    const bcols = Math.ceil(Math.sqrt(n));
    const brows = Math.ceil(n / bcols);
    const margin = 1.6;
    const innerW = Math.max(1, side - 2 * margin);
    const innerD = Math.max(1, side - 2 * margin);
    const cellW = innerW / bcols;
    const cellD = innerD / brows;

    files.forEach((f, j) => {
      const bc = j % bcols;
      const br = Math.floor(j / bcols);
      const cx = dx + margin + bc * cellW + cellW / 2;
      const cz = dz + margin + br * cellD + cellD / 2;
      const maxFoot = Math.min(cellW, cellD) * 0.78;
      const foot = Math.max(0.7, Math.min(maxFoot, 0.7 + Math.sqrt(Math.max(1, f.lines) / 500) * 1.5));
      const isLandmark = f.id === landmarkId;
      const height = heightForLines(f.lines) * (isLandmark ? 1.45 : 1);
      outBuildings.push({
        id: f.id,
        name: f.name,
        districtId: d.id,
        x: cx,
        z: cz,
        width: foot,
        depth: foot,
        height,
        lines: f.lines,
        role: f.role,
        importance: f.importance ?? 0,
        isLandmark,
        landmarkType: isLandmark ? landmarkTypeFor(f) : undefined,
      });
      extent = Math.max(extent, Math.abs(cx) + foot, Math.abs(cz) + foot);
    });
  });

  return { districts: outDistricts, buildings: outBuildings, extent };
}

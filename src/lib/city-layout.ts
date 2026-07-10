/**
 * city-layout — a deterministic squarified-treemap layout for the Code City.
 *
 * Ported line-for-line from the Clojure engine
 * (code-city-backend/src/code_city/layout/treemap.clj), which implements
 * Bruls, Huizing & van Wijk, "Squarified Treemaps" (2000). Two passes:
 *
 *   Pass 1 — DISTRICTS: each module group's footprint area is the sum of its
 *            files' lines; groups are squarified into the viewport.
 *   Pass 2 — BUILDINGS: within each district, each file's footprint area is its
 *            line count; files are squarified into the district's rectangle.
 *            Building HEIGHT is a function of lines.
 *
 * The report is a STATIC artifact (no backend at view time), so the city is
 * laid out client-side — but deterministically: the same repository always
 * produces the same city, so a reader builds a durable spatial memory (the
 * project's #1 design principle — a stable base map that never jitters). The
 * ONLY thing between us and determinism is input order, so every list is sorted
 * by a stable key (group id, file path) before layout. No randomness, no time.
 */

// ─── generic treemap primitives (area-proportional nested rectangles) ───────

export interface Rect {
  x: number;
  z: number;
  width: number;
  depth: number;
}

interface AreaItem {
  area: number;
}

type Placed<T> = T & Rect;

/** Worst aspect ratio in a row of `areas` laid along a strip of length `side`. */
function aspectRatio(areas: number[], side: number): number | undefined {
  if (areas.length === 0) return undefined;
  const total = areas.reduce((a, b) => a + b, 0);
  const other = total / side;
  let worst = 0;
  for (const area of areas) {
    const w = area / other;
    worst = Math.max(worst, Math.max(w / other, other / w));
  }
  return worst;
}

/**
 * Partition `items` (a copy is sorted desc by area) into rows: greedily grow a
 * row while adding the next item keeps the worst aspect ratio no worse, else
 * start a fresh row. Mirrors treemap.clj/squarify.
 */
function squarify<T extends AreaItem>(items: T[], bounds: Rect): T[][] {
  const shortSide = Math.min(bounds.width, bounds.depth);
  const remaining = [...items].sort((a, b) => b.area - a.area);
  const rows: T[][] = [];
  let current: T[] = [];
  let i = 0;
  while (i < remaining.length) {
    const nextItem = remaining[i];
    const currAreas = current.map((it) => it.area);
    const candAreas = [...currAreas, nextItem.area];
    const currRatio = aspectRatio(currAreas, shortSide);
    const candRatio = aspectRatio(candAreas, shortSide)!;
    if (current.length === 0 || candRatio <= (currRatio ?? Number.MAX_VALUE)) {
      current.push(nextItem);
      i += 1; // consume the item
    } else {
      rows.push(current);
      current = []; // retry this item in a fresh row (do NOT advance i)
    }
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

/**
 * Position one row's items within `bounds` and return the bounds left for the
 * next row. Mirrors treemap.clj/layout-row. `along` names the axis the row
 * EXTENDS along:
 *   - "x": a vertical strip of width `strip` along x; items stack along z.
 *   - "z": a horizontal strip of depth `strip` along z; items lay out along x.
 * Because every item's scaled area equals its footprint and the remaining
 * bounds area always equals the remaining items' area, `strip` never exceeds
 * the bound it's carved from.
 */
function layoutRow<T extends AreaItem>(
  row: T[],
  bounds: Rect,
  along: "x" | "z"
): { positioned: Placed<T>[]; remaining: Rect } {
  const rowTotal = row.reduce((a, b) => a + b.area, 0);
  const boundsArea = bounds.width * bounds.depth;
  const frac = boundsArea === 0 ? 0 : rowTotal / boundsArea;
  const strip = along === "x" ? bounds.width * frac : bounds.depth * frac;

  const positioned: Placed<T>[] = [];
  let offset = 0;
  for (const item of row) {
    const itemFrac = rowTotal === 0 ? 0 : item.area / rowTotal;
    if (along === "x") {
      const dz = bounds.depth * itemFrac; // item's extent along z
      positioned.push({ ...item, x: bounds.x, z: bounds.z + offset, width: strip, depth: dz } as Placed<T>);
      offset += dz;
    } else {
      const dx = bounds.width * itemFrac; // item's extent along x
      positioned.push({ ...item, x: bounds.x + offset, z: bounds.z, width: dx, depth: strip } as Placed<T>);
      offset += dx;
    }
  }

  const remaining: Rect =
    along === "x"
      ? { ...bounds, x: bounds.x + strip, width: bounds.width - strip }
      : { ...bounds, z: bounds.z + strip, depth: bounds.depth - strip };
  return { positioned, remaining };
}

/** Lay out `items` (each carrying an `area`) inside `bounds`, adding x/z/width/
 *  depth to each. Mirrors layout-treemap. */
export function layoutTreemap<T extends AreaItem>(
  items: T[],
  bounds: Rect
): Placed<T>[] {
  if (items.length === 0) return [];
  const totalArea = items.reduce((a, b) => a + b.area, 0);
  const boundsArea = bounds.width * bounds.depth;
  const scale = boundsArea / Math.max(totalArea, 0.001);
  const scaled = items.map((it) => ({ ...it, area: it.area * scale }));
  const rows = squarify(scaled, bounds);

  let cur = bounds;
  const result: Placed<T>[] = [];
  for (const row of rows) {
    const along: "x" | "z" = cur.width >= cur.depth ? "x" : "z";
    const { positioned, remaining } = layoutRow(row, cur, along);
    result.push(...positioned);
    cur = remaining;
  }
  return result;
}

// ─── the city: districts (module groups) → buildings (files) ────────────────

export type LandmarkType = "skyscraper" | "tower";

/** A file to place as a building. `lines` drives footprint AND height. */
export interface CityFileInput {
  id: string; // stable key (the file path) — also the tie-break sort key
  name: string;
  lines: number;
  role: string;
  importance: number;
  isEntryPoint: boolean;
}

/** A module group to place as a district, carrying its files. */
export interface CityDistrictInput {
  id: string; // stable key — the tie-break sort key
  name: string;
  files: CityFileInput[];
}

export interface CityBuilding {
  id: string;
  name: string;
  districtId: string;
  /** Footprint centre (x,z) and base y=0 — the box sits ON the ground. */
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
}

export interface CityDistrict {
  id: string;
  name: string;
  color: string;
  /** Ground rectangle (top-left x,z + size), in world units. */
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
  /** Half-extent of the whole city (max |x|,|z|) — handy for camera framing. */
  extent: number;
}

/**
 * District tints — a small, deterministic palette drawn from the app's muted
 * `--bpmn` accents plus a few complementary hues, so the city reads as one
 * family rather than a rainbow (pre-attentive colour budget: ≤7 categoricals).
 * Cycled by the district's sorted index, so the same repo always colours the
 * same way.
 */
const DISTRICT_COLORS = [
  "#7dd3fc", // cyan
  "#7dd3ae", // mint
  "#d4a574", // amber
  "#b39ddb", // lavender
  "#d18589", // rose
  "#8fb5d9", // steel
  "#c3b091", // sand
  "#9ec6a4", // sage
];

const VIEWPORT = { x: -50, z: -50, width: 100, depth: 100 };

const byId = <T extends { id: string }>(a: T, b: T) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Building height from lines — sqrt-compressed so a 2,000-line file towers
 *  over a 50-line one without dwarfing the whole skyline. Tuned by eye so the
 *  skyline reads as buildings, not tiles. */
function heightForLines(lines: number): number {
  return Math.min(22, 1.1 + Math.sqrt(Math.max(0, lines)) * 0.52);
}

/**
 * Compose the whole city: a two-pass squarified treemap (districts, then
 * buildings within each district), fully deterministic given the inputs
 * (every list is sorted by its stable id first). Buildings are inset from
 * their treemap cell so streets show between them; the tallest / entry-point
 * building in each district is promoted to a landmark.
 */
export function buildCity(
  districtInputs: CityDistrictInput[],
  opts: { streetGap?: number } = {}
): CityLayout {
  const streetGap = opts.streetGap ?? 0.32;
  const districts = [...districtInputs].sort(byId).filter((d) => d.files.length);

  // Pass 1 — districts sized by their total lines.
  const districtItems = districts.map((d) => ({
    id: d.id,
    area: Math.max(1, d.files.reduce((s, f) => s + Math.max(1, f.lines), 0)),
  }));
  const placedDistricts = layoutTreemap(districtItems, VIEWPORT);
  const boundsById = new Map(placedDistricts.map((d) => [d.id, d]));

  const outDistricts: CityDistrict[] = [];
  const outBuildings: CityBuilding[] = [];
  let extent = 0;

  districts.forEach((d, di) => {
    const b = boundsById.get(d.id);
    if (!b) return;
    const totalLines = d.files.reduce((s, f) => s + Math.max(1, f.lines), 0);
    outDistricts.push({
      id: d.id,
      name: d.name,
      color: DISTRICT_COLORS[di % DISTRICT_COLORS.length],
      x: b.x,
      z: b.z,
      width: b.width,
      depth: b.depth,
      buildingCount: d.files.length,
      totalLines,
    });

    // Pass 2 — buildings within a padded district rectangle.
    const pad = 1.1;
    const inner: Rect = {
      x: b.x + pad,
      z: b.z + pad,
      width: Math.max(1, b.width - 2 * pad),
      depth: Math.max(1, b.depth - 2 * pad),
    };
    const files = [...d.files].sort(byId);
    const items = files.map((f) => ({ file: f, area: Math.max(1, f.lines) }));
    const placed = layoutTreemap(items, inner);

    // Landmark = the file with the highest prominence in this district
    // (entry points weigh heavily, importance breaks the rest). One per
    // district keeps the "church spire" orientation cue legible.
    const prominence = (f: CityFileInput) =>
      (f.isEntryPoint ? 1000 : 0) + (f.importance ?? 0) * 10 + f.lines / 100;
    let landmarkId: string | null = null;
    let best = -Infinity;
    for (const f of files) {
      const p = prominence(f);
      if (p > best) { best = p; landmarkId = f.id; }
    }

    for (const p of placed) {
      const f = p.file;
      // Footprint from the treemap cell, minus the street gap — but CAPPED, so
      // a huge file becomes a tall tower with a little plaza around it rather
      // than a giant flat slab. Height (∝ lines) is the signal we want to lead.
      const maxFoot = 4.2;
      const w = Math.min(maxFoot, Math.max(0.5, p.width - 2 * streetGap));
      const depth = Math.min(maxFoot, Math.max(0.5, p.depth - 2 * streetGap));
      const cx = p.x + p.width / 2;
      const cz = p.z + p.depth / 2;
      const isLandmark = f.id === landmarkId;
      const height = heightForLines(f.lines) * (isLandmark ? 1.45 : 1);
      outBuildings.push({
        id: f.id,
        name: f.name,
        districtId: d.id,
        x: cx,
        z: cz,
        width: w,
        depth,
        height,
        lines: f.lines,
        role: f.role,
        importance: f.importance ?? 0,
        isLandmark,
        landmarkType: isLandmark
          ? f.isEntryPoint
            ? "tower"
            : "skyscraper"
          : undefined,
      });
      extent = Math.max(extent, Math.abs(cx) + w / 2, Math.abs(cz) + depth / 2);
    }
  });

  return { districts: outDistricts, buildings: outBuildings, extent };
}


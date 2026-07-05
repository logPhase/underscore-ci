import type { MonoService } from "@/types/analysis";
import type { PositionedGroupRegion, ServiceGroup } from "@/types/grouping";
import { hashString, UNGROUPED_ID } from "./group-layout";

// ---------------------------------------------------------------------------
// Ordered canvas layout — the architectural, grid-aligned arrangement.
//
// Where group-layout.ts scatters group hulls on an orbit (organic, blobby),
// this engine draws the world like a component diagram: dependency direction
// picks COLUMNS (importers left of what they import, so flows run left→right),
// groups STACK vertically inside a column, services sit on a neat grid inside
// their group hull, and packages sit on a neat grid inside their service.
//
// Everything is pure and deterministic (#19: same inputs → identical output).
// Ties break alphabetically throughout. Sizes cascade BOTTOM-UP: a package's
// file count sets its blob radius → the package grid extent sets the service
// radius → the service grid extent sets the group hull radius → the hull radii
// set the column widths and vertical stacks. Seeds are preserved so blob
// shapes are untouched — only positions and radii change (#10 stable base map,
// but re-drawn as an ordered diagram).
// ---------------------------------------------------------------------------

// World center — kept in the same neighbourhood as the backend/orbit layout so
// the camera-fit, minimap and zoom clamps all still assume ~current scale.
const WORLD_CX = 400;
const WORLD_CY = 300;

// ── Package cell sizing (bottom of the cascade) ──────────────────────
/** Blob radius floor + growth per file. Gentle linear growth, clamped so a
 *  huge component can't dwarf the grid. Mirrors the old get-positions feel. */
const PACKAGE_BASE_R = 22;
const PACKAGE_PER_FILE = 1.7;
const PACKAGE_MAX_R = 78;
/** Empty-service / no-files fallback so a service is never a zero-radius dot. */
const PACKAGE_FALLBACK_R = 30;
/** Up to 3 package cells per row — the "component diagram" grid. */
const PACKAGE_COLS = 3;
/** Gap between package cell boundaries in the grid. */
const PACKAGE_GAP = 30;
/** Breathing room between the outermost package edge and the service blob. */
const SERVICE_PADDING = 42;

// ── Service grid (inside a group) ────────────────────────────────────
/** Gap between service blob boundaries inside a group. */
const SERVICE_GAP = 70;
/** Breathing room between the outermost service edge and the group hull. */
const GROUP_PADDING = 70;

// ── Column layout (groups → columns) ─────────────────────────────────
/** Horizontal gap between dependency columns. */
const COLUMN_GAP = 240;
/** Vertical gap between group hulls stacked in one column. */
const GROUP_STACK_GAP = 150;

// ---------------------------------------------------------------------------
// Package grid — shared by the engine (to size a service) and by
// get-positions.ts (to place the package blobs). Both MUST agree, so the grid
// is a pure function of the ordered (name, fileCount) set.
// ---------------------------------------------------------------------------

/** A service's package list with the file count that drives each blob size. */
export interface PackageSize {
  name: string;
  fileCount: number;
}

/** One placed package cell — offset from the service origin + its blob radius. */
export interface PackageCell {
  name: string;
  fileCount: number;
  radius: number;
  dx: number;
  dy: number;
}

/** Placed package grid + the service radius needed to contain it (with pad). */
export interface PackageGrid {
  cells: PackageCell[];
  radius: number;
}

/** Blob radius for a package/component from its file count. */
export function packageRadius(fileCount: number): number {
  return Math.min(PACKAGE_MAX_R, PACKAGE_BASE_R + Math.max(0, fileCount) * PACKAGE_PER_FILE);
}

/**
 * Lay a service's packages out on a neat up-to-3-per-row grid, ordered by file
 * count desc then name (deterministic). Rows are centred so a short final row
 * sits under the middle of the row above. The returned `radius` is the service
 * radius: the farthest cell edge from the origin plus padding.
 *
 * Uniform cell pitch (2·maxRadius + gap) keeps the grid axis-aligned — the
 * "drawn component diagram" look — at the cost of some slack when cell sizes
 * vary. Since a service holds only a handful of components that reads as tidy,
 * not wasteful.
 */
export function computePackageGrid(packages: PackageSize[]): PackageGrid {
  if (packages.length === 0) return { cells: [], radius: PACKAGE_FALLBACK_R };

  const ordered = [...packages].sort(
    (a, b) => b.fileCount - a.fileCount || a.name.localeCompare(b.name)
  );

  if (ordered.length === 1) {
    const radius = packageRadius(ordered[0].fileCount);
    return {
      cells: [{ name: ordered[0].name, fileCount: ordered[0].fileCount, radius, dx: 0, dy: 0 }],
      radius: Math.round(radius + SERVICE_PADDING),
    };
  }

  const cols = Math.min(PACKAGE_COLS, ordered.length);
  const rows = Math.ceil(ordered.length / cols);
  const maxR = Math.max(...ordered.map((p) => packageRadius(p.fileCount)));
  const pitch = 2 * maxR + PACKAGE_GAP;

  const cells: PackageCell[] = ordered.map((p, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const rowCount = Math.min(cols, ordered.length - row * cols);
    return {
      name: p.name,
      fileCount: p.fileCount,
      radius: packageRadius(p.fileCount),
      dx: Math.round((col - (rowCount - 1) / 2) * pitch),
      dy: Math.round((row - (rows - 1) / 2) * pitch),
    };
  });

  let radius = 0;
  for (const c of cells) radius = Math.max(radius, Math.hypot(c.dx, c.dy) + c.radius);
  return { cells, radius: Math.round(radius + SERVICE_PADDING) };
}

// ---------------------------------------------------------------------------
// Service grid (inside a group)
// ---------------------------------------------------------------------------

interface ServiceSlot {
  id: string;
  radius: number;
  dx: number;
  dy: number;
}

/**
 * Place a group's member services relative to the group origin. Members arrive
 * pre-ordered (file count desc, then id). ≤3 members stack in one tight column
 * (packed by their actual radii, so a small service doesn't sit a full big-blob
 * pitch away); >3 members fill a uniform 2-column grid. Returns the slots and
 * the hull radius that contains every blob plus padding.
 */
function layoutGroupServices(members: { id: string; radius: number }[]): {
  slots: ServiceSlot[];
  radius: number;
} {
  const n = members.length;
  if (n === 1) {
    return {
      slots: [{ id: members[0].id, radius: members[0].radius, dx: 0, dy: 0 }],
      radius: Math.round(members[0].radius + GROUP_PADDING),
    };
  }

  const cols = n <= 3 ? 1 : 2;
  let slots: ServiceSlot[];

  if (cols === 1) {
    // Tight vertical stack, centred on the group origin — cumulative by radius
    // so heterogeneous blob sizes pack snugly instead of on a wasteful pitch.
    const totalH = members.reduce((h, m) => h + 2 * m.radius, 0) + (n - 1) * SERVICE_GAP;
    let y = -totalH / 2;
    slots = members.map((m) => {
      const cy = y + m.radius;
      y += 2 * m.radius + SERVICE_GAP;
      return { id: m.id, radius: m.radius, dx: 0, dy: Math.round(cy) };
    });
  } else {
    // Uniform 2-column grid — axis-aligned, rows centred.
    const rows = Math.ceil(n / cols);
    const maxR = Math.max(...members.map((m) => m.radius));
    const pitch = 2 * maxR + SERVICE_GAP;
    slots = members.map((m, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const rowCount = Math.min(cols, n - row * cols);
      return {
        id: m.id,
        radius: m.radius,
        dx: Math.round((col - (rowCount - 1) / 2) * pitch),
        dy: Math.round((row - (rows - 1) / 2) * pitch),
      };
    });
  }

  let radius = 0;
  for (const s of slots) radius = Math.max(radius, Math.hypot(s.dx, s.dy) + s.radius);
  return { slots, radius: Math.round(radius + GROUP_PADDING) };
}

// ---------------------------------------------------------------------------
// Membership resolution — mirrors group-layout.ts so grouped runs partition
// identically: groups sorted by id, first wins on duplicates, unknown ids
// dropped, any unassigned service swept into a synthetic "Ungrouped" hull.
// ---------------------------------------------------------------------------

interface ResolvedGroup {
  group: ServiceGroup;
  memberIds: string[];
}

function resolveMemberships(
  services: MonoService[],
  groups: ServiceGroup[]
): ResolvedGroup[] {
  const serviceById = new Map(services.map((s) => [s.id, s]));
  const claimed = new Set<string>();
  const resolved: ResolvedGroup[] = [];

  for (const group of [...groups].sort((a, b) => a.id.localeCompare(b.id))) {
    const memberIds = [...new Set(group.services)]
      .filter((id) => serviceById.has(id) && !claimed.has(id))
      .sort((a, b) => a.localeCompare(b));
    memberIds.forEach((id) => claimed.add(id));
    if (memberIds.length > 0) resolved.push({ group, memberIds });
  }

  const unassigned = services
    .map((s) => s.id)
    .filter((id) => !claimed.has(id))
    .sort((a, b) => a.localeCompare(b));
  if (unassigned.length > 0) {
    resolved.push({
      group: {
        id: UNGROUPED_ID,
        name: "Ungrouped",
        description: "Modules the grouping agent did not assign",
        services: unassigned,
      },
      memberIds: unassigned,
    });
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Group → column assignment (dependency-directed longest-path layering)
// ---------------------------------------------------------------------------

interface GroupEdge {
  from: string;
  to: string;
  weight: number;
}

/** Aggregate service→service dependencies up to group→group edges, dropping
 *  self-loops and summing importCount across the many service edges that fold
 *  into one group pair. Deterministic order (from id, then to id). */
function aggregateGroupEdges(
  resolved: ResolvedGroup[],
  dependencies: { from: string; to: string; importCount?: number }[]
): GroupEdge[] {
  const groupOf = new Map<string, string>();
  for (const { group, memberIds } of resolved)
    for (const id of memberIds) groupOf.set(id, group.id);

  const weights = new Map<string, number>();
  for (const dep of dependencies) {
    const fg = groupOf.get(dep.from);
    const tg = groupOf.get(dep.to);
    if (!fg || !tg || fg === tg) continue;
    const key = `${fg} ${tg}`;
    weights.set(key, (weights.get(key) ?? 0) + (dep.importCount ?? 1));
  }

  return [...weights.entries()]
    .map(([key, weight]) => {
      const [from, to] = key.split(" ");
      return { from, to, weight };
    })
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

/**
 * Assign each group a column index. An edge from→to means "from imports to",
 * so `from` must sit strictly LEFT of `to` (column(from) < column(to)) and the
 * whole diagram flows left→right along dependency direction.
 *
 * Longest-path layering (Kahn) over the dependency DAG. Cycles are broken
 * deterministically before layering: peel zero-in-degree nodes; when a cycle
 * remains, drop its lowest-weight edge (ties: from id, then to id) — the weak
 * back-edge — and retry. Groups touched by no edge at all are parked in the
 * LAST column (tooling to the right).
 */
function assignColumns(
  groupIds: string[],
  edges: GroupEdge[]
): { columns: Map<string, number>; droppedBackEdges: GroupEdge[] } {
  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.from);
    connected.add(e.to);
  }

  // No dependencies at all → everything in a single column.
  if (connected.size === 0) {
    return { columns: new Map(groupIds.map((g) => [g, 0])), droppedBackEdges: [] };
  }

  // Break cycles → acyclic edge set + topological order.
  let active = edges.slice();
  const dropped: GroupEdge[] = [];
  let order: string[] = [];
  for (;;) {
    const indeg = new Map<string, number>(groupIds.map((g) => [g, 0]));
    for (const e of active) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);

    const remaining = new Set(groupIds);
    const queue = groupIds.filter((g) => indeg.get(g) === 0).sort();
    order = [];
    while (queue.length > 0) {
      queue.sort();
      const u = queue.shift()!;
      if (!remaining.has(u)) continue;
      remaining.delete(u);
      order.push(u);
      for (const e of active) {
        if (e.from !== u || !remaining.has(e.to)) continue;
        indeg.set(e.to, indeg.get(e.to)! - 1);
        if (indeg.get(e.to) === 0) queue.push(e.to);
      }
    }

    if (order.length === groupIds.length) break;

    // Cycle among `remaining` — drop its lowest-weight (weakest) back-edge.
    const inCycle = active
      .filter((e) => remaining.has(e.from) && remaining.has(e.to))
      .sort(
        (a, b) =>
          a.weight - b.weight ||
          a.from.localeCompare(b.from) ||
          a.to.localeCompare(b.to)
      );
    const drop = inCycle[0];
    dropped.push(drop);
    active = active.filter((e) => e !== drop);
  }

  // Longest-path columns over the acyclic edge set.
  const columns = new Map<string, number>(groupIds.map((g) => [g, 0]));
  for (const u of order)
    for (const e of active)
      if (e.from === u)
        columns.set(e.to, Math.max(columns.get(e.to)!, columns.get(u)! + 1));

  // Park edgeless groups in the column just right of everything connected.
  let maxConnected = 0;
  for (const g of connected) maxConnected = Math.max(maxConnected, columns.get(g)!);
  for (const g of groupIds)
    if (!connected.has(g)) columns.set(g, maxConnected + 1);

  return { columns, droppedBackEdges: dropped };
}

// ---------------------------------------------------------------------------
// Engine entry point
// ---------------------------------------------------------------------------

export interface OrderedLayoutResult {
  /** Every input service, original order, with new cx/cy AND grown radius
   *  (seed preserved). The radius grows to contain the package grid. */
  services: MonoService[];
  /** Positioned group hulls, one per resolved group. */
  groupRegions: PositionedGroupRegion[];
}

/**
 * Arrange services into an ordered, grid-aligned architectural diagram.
 *
 * Mirrors applyGroupLayout's contract (`{ services, groupRegions }`) so the
 * transform can swap one for the other. `packagesByService` supplies each
 * service's package/component file counts so the engine can grow service radii
 * to contain their grids — get-positions.ts then reproduces the SAME grid from
 * the SAME counts, so package blobs sit exactly inside the grown service.
 * When counts for a service are absent the service keeps its incoming radius.
 */
export function applyOrderedLayout(
  services: MonoService[],
  groups: ServiceGroup[],
  dependencies: { from: string; to: string; importCount?: number }[],
  packagesByService?: Map<string, PackageSize[]>
): OrderedLayoutResult {
  const resolved = resolveMemberships(services, groups);
  if (resolved.length === 0) return { services, groupRegions: [] };

  // 1. Grow every service radius from its package grid (bottom of cascade).
  const grownRadius = new Map<string, number>();
  const fileCountOf = new Map<string, number>();
  for (const svc of services) {
    const pkgs = packagesByService?.get(svc.id);
    if (pkgs && pkgs.length > 0) {
      grownRadius.set(svc.id, computePackageGrid(pkgs).radius);
      fileCountOf.set(svc.id, pkgs.reduce((sum, p) => sum + p.fileCount, 0));
    } else {
      grownRadius.set(svc.id, svc.radius);
      fileCountOf.set(svc.id, 0);
    }
  }
  const radiusOf = (id: string) => grownRadius.get(id)!;

  // 2. Lay out each group's services on a grid → per-group slots + hull radius.
  //    Members ordered by total file count desc, then id.
  const laidOut = resolved.map(({ group, memberIds }) => {
    const members = [...memberIds]
      .sort(
        (a, b) => (fileCountOf.get(b)! - fileCountOf.get(a)!) || a.localeCompare(b)
      )
      .map((id) => ({ id, radius: radiusOf(id) }));
    const { slots, radius } = layoutGroupServices(members);
    const files = memberIds.reduce((sum, id) => sum + fileCountOf.get(id)!, 0);
    return { group, slots, hullRadius: radius, files };
  });
  const byGroupId = new Map(laidOut.map((g) => [g.group.id, g]));

  // 3. Assign columns from group→group dependency direction.
  const groupIds = laidOut.map((g) => g.group.id);
  const edges = aggregateGroupEdges(resolved, dependencies);
  const { columns } = assignColumns(groupIds, edges);

  // 4. Bucket groups by column; order each column top→bottom by file count desc.
  const columnIndices = [...new Set([...columns.values()])].sort((a, b) => a - b);
  const columnGroups = new Map<number, typeof laidOut>();
  for (const idx of columnIndices) {
    const inCol = laidOut
      .filter((g) => columns.get(g.group.id) === idx)
      .sort((a, b) => b.files - a.files || a.group.id.localeCompare(b.group.id));
    columnGroups.set(idx, inCol);
  }

  // 5. Column X positions — widths from the widest hull, laid left→right, then
  //    the whole run centred on WORLD_CX.
  const colWidth = new Map<number, number>();
  for (const idx of columnIndices) {
    const groupsInCol = columnGroups.get(idx)!;
    const maxHull = Math.max(...groupsInCol.map((g) => g.hullRadius));
    colWidth.set(idx, 2 * maxHull);
  }
  const colCenterX = new Map<number, number>();
  let cursorX = 0;
  for (const idx of columnIndices) {
    const w = colWidth.get(idx)!;
    colCenterX.set(idx, cursorX + w / 2);
    cursorX += w + COLUMN_GAP;
  }
  const totalWidth = cursorX - COLUMN_GAP;
  const offsetX = WORLD_CX - totalWidth / 2;

  // 6. Place groups: stack vertically within a column, centred on WORLD_CY,
  //    then resolve absolute service positions from the group slots.
  const positionById = new Map<string, { cx: number; cy: number }>();
  const groupRegions: PositionedGroupRegion[] = [];

  for (const idx of columnIndices) {
    const groupsInCol = columnGroups.get(idx)!;
    const cx = Math.round(colCenterX.get(idx)! + offsetX);
    const stackH =
      groupsInCol.reduce((h, g) => h + 2 * g.hullRadius, 0) +
      (groupsInCol.length - 1) * GROUP_STACK_GAP;
    let cursorY = WORLD_CY - stackH / 2;

    for (const g of groupsInCol) {
      const cy = Math.round(cursorY + g.hullRadius);
      cursorY += 2 * g.hullRadius + GROUP_STACK_GAP;

      for (const slot of g.slots)
        positionById.set(slot.id, { cx: cx + slot.dx, cy: cy + slot.dy });

      groupRegions.push({
        id: g.group.id,
        name: g.group.name,
        description: g.group.description ?? "",
        cx,
        cy,
        radius: g.hullRadius,
        seed: hashString(g.group.id),
        serviceIds: g.slots.map((s) => s.id),
      });
    }
  }

  return {
    services: services.map((svc) => {
      const pos = positionById.get(svc.id);
      return pos
        ? { ...svc, cx: pos.cx, cy: pos.cy, radius: radiusOf(svc.id) }
        : svc;
    }),
    groupRegions,
  };
}

// The hub's designed C4 diagram — a PURE layout engine that arranges the real
// architecture payload the way the founder's front-page mock draws it:
// external systems flanking left/right, a dashed [Software System] boundary in
// the middle with lane-labelled rows (deployable units / persistence &
// messaging — or one lane per layer at component level), labeled edges as
// soft S-curves. Deterministic: same payload → same picture.

import type { ArchEdge, ArchNode } from "@/types/architecture";

export interface DiagBox {
  id: string;
  name: string;
  tech: string;      // the mock's "[Container: …]" line
  desc: string;
  accent: string;
  x: number;
  y: number;
  w: number;
  h: number;
  changed: boolean;
  external: boolean;
}

export interface DiagEdge {
  d: string;         // svg path
  stroke: string;
  dash: string;
  label: string | null;
  lx: number;        // label pill centre
  ly: number;
  from: string;      // endpoint box ids — drive the hover focus
  to: string;
}

/** Icon KEY for a node — brandish where the name gives it away, kind
 *  fallback otherwise. Pure so the mapping is testable; the component maps
 *  keys to actual icon glyphs. */
export function iconKeyFor(name: string, kind: string): string {
  const n = name.toLowerCase();
  if (/redis|cache/.test(n)) return "cache";
  if (/blob|bucket|s3/.test(n)) return "blob";
  if (/postgres|sql|database/.test(n)) return "database";
  if (/azure|cloud|aws|gcp/.test(n)) return "cloud";
  if (/kafka|topic|queue/.test(n)) return "topic";
  if (/mqtt|broker/.test(n)) return "broker";
  if (/camera/.test(n)) return "camera";
  if (/user|driver|person|operator|motorist/.test(n)) return "user";
  switch (kind) {
    case "person": return "user";
    case "datastore": return "database";
    case "topic": return "topic";
    case "component": return "component";
    case "external": return "external";
    default: return "service";
  }
}

export interface DiagLane {
  label: string;
  y: number;
}

export interface DiagLayout {
  width: number;
  height: number;
  boxes: DiagBox[];
  edges: DiagEdge[];
  lanes: DiagLane[];
  boundary: { x: number; y: number; w: number; h: number; label: string };
}

const ACCENT: Record<string, string> = {
  service: "#7DD3FC",
  component: "#7DD3FC",
  datastore: "#4ADE80",
  topic: "#C4B5FD",
  external: "#8A94A9",
};

const EDGE_STROKE: Record<string, string> = {
  sync: "rgba(125,211,252,0.55)",
  async: "rgba(196,181,253,0.55)",
  data: "rgba(74,222,128,0.5)",
  dependency: "rgba(95,104,121,0.5)",
};

const TECH_LABEL: Record<string, string> = {
  service: "Container",
  component: "Component",
  datastore: "Data store",
  topic: "Message topic",
  external: "External System",
};

const BOX_H = 100;
const EXT_W = 196;
const EXT_H = 88;
const GAP = 18;
const LANE_GAP = 46;
const PAD = 26;

function techLine(n: ArchNode): string {
  const base = TECH_LABEL[n.kind] ?? n.kind;
  return n.layer ? `[${base} · ${n.layer}]` : `[${base}]`;
}

/** Chunk `items` into rows of at most `perRow`. */
function rows<T>(items: T[], perRow: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += perRow)
    out.push(items.slice(i, i + perRow));
  return out;
}

export function layoutDiagram(
  nodes: ArchNode[],
  edges: ArchEdge[],
  level: 1 | 2,
  systemName: string,
  width = 1176,
): DiagLayout {
  const internalKinds =
    level === 1 ? ["service", "datastore", "topic"] : ["component"];
  const internal = nodes.filter((n) => internalKinds.includes(n.kind));
  const externals = nodes.filter((n) => n.kind === "external");

  // ── lanes inside the boundary ──────────────────────────────────────────
  let laneDefs: { label: string; nodes: ArchNode[] }[];
  if (level === 1) {
    const units = internal.filter((n) => n.kind === "service");
    const persist = internal.filter((n) => n.kind !== "service");
    laneDefs = [
      { label: "Deployable units", nodes: units },
      { label: "Persistence & messaging", nodes: persist },
    ].filter((l) => l.nodes.length > 0);
    // A repo whose L1 graph is all components (no service nodes): fall back
    // to a single unnamed lane with everything, so the diagram never blanks.
    if (laneDefs.length === 0 && internal.length > 0)
      laneDefs = [{ label: "Building blocks", nodes: internal }];
  } else {
    const byLayer = new Map<string, ArchNode[]>();
    for (const n of internal) {
      const k = n.layer || "components";
      if (!byLayer.has(k)) byLayer.set(k, []);
      byLayer.get(k)!.push(n);
    }
    laneDefs = [...byLayer.entries()].map(([label, ns]) => ({ label, nodes: ns }));
  }

  const hasExternals = externals.length > 0;
  const bx = hasExternals ? EXT_W + 44 : 0;
  const bw = width - 2 * bx;
  const innerW = bw - 2 * PAD;
  const perRow = Math.max(1, Math.floor((innerW + GAP) / (206 + GAP)));

  const boxes: DiagBox[] = [];
  const lanes: DiagLane[] = [];
  let y = 92; // room for the boundary label row + the first lane label
  for (const lane of laneDefs) {
    lanes.push({ label: lane.label, y: y - 14 });
    const laneRows = rows(lane.nodes, perRow);
    for (const row of laneRows) {
      const w = Math.floor((innerW - GAP * (row.length - 1)) / row.length);
      row.forEach((n, i) => {
        boxes.push({
          id: n.id, name: n.name, tech: techLine(n),
          desc: n.description ?? "", accent: ACCENT[n.kind] ?? "#7DD3FC",
          x: bx + PAD + i * (w + GAP), y, w: Math.min(w, 320), h: BOX_H,
          changed: n.prStatus != null, external: false,
        });
      });
      y += BOX_H + GAP;
    }
    y += LANE_GAP - GAP;
  }
  const boundaryH = Math.max(y - LANE_GAP + PAD, 200);
  const boundary = { x: bx, y: 18, w: bw, h: boundaryH,
                     label: `${systemName} [Software System]` };

  // ── externals flank left/right, vertically centred ─────────────────────
  const leftExt = externals.filter((_, i) => i % 2 === 0);
  const rightExt = externals.filter((_, i) => i % 2 === 1);
  const flank = (list: ArchNode[], x: number) => {
    const total = list.length * EXT_H + (list.length - 1) * GAP;
    let ey = Math.max(30, 18 + (boundaryH - total) / 2);
    for (const n of list) {
      boxes.push({
        id: n.id, name: n.name, tech: techLine(n),
        desc: n.description ?? "", accent: ACCENT.external,
        x, y: ey, w: EXT_W, h: EXT_H, changed: n.prStatus != null,
        external: true,
      });
      ey += EXT_H + GAP;
    }
  };
  if (hasExternals) {
    flank(leftExt, 0);
    flank(rightExt, width - EXT_W);
  }

  const height = Math.max(boundaryH + 40,
    Math.max(leftExt.length, rightExt.length) * (EXT_H + GAP) + 60);

  // ── edges — soft S-curves between box border midpoints ─────────────────
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const out: DiagEdge[] = [];
  let labelFlip = false;
  for (const e of edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    // anchor sides: prefer horizontal connection (right→left) unless the
    // boxes overlap horizontally, then vertical (bottom→top).
    const aCx = a.x + a.w / 2, aCy = a.y + a.h / 2;
    const bCx = b.x + b.w / 2, bCy = b.y + b.h / 2;
    const horizontal =
      Math.abs(aCx - bCx) > (a.w + b.w) / 2 - 8;
    let sx: number, sy: number, tx: number, ty: number, d: string;
    if (horizontal) {
      const aRight = aCx < bCx;
      sx = aRight ? a.x + a.w : a.x;
      sy = aCy;
      tx = aRight ? b.x : b.x + b.w;
      ty = bCy;
      const mx = (sx + tx) / 2;
      d = `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`;
    } else {
      const aAbove = aCy < bCy;
      sx = aCx;
      sy = aAbove ? a.y + a.h : a.y;
      tx = bCx;
      ty = aAbove ? b.y : b.y + b.h;
      const my = (sy + ty) / 2;
      d = `M ${sx} ${sy} C ${sx} ${my}, ${tx} ${my}, ${tx} ${ty}`;
    }
    labelFlip = !labelFlip;
    // The mock labels the edges that CROSS the system boundary; the internal
    // pub/sub story is already told by the topic cards themselves. Labelling
    // all 50+ internal edges buries the diagram in pills.
    const crossesBoundary = a.external !== b.external;
    out.push({
      d,
      stroke: EDGE_STROKE[e.kind] ?? EDGE_STROKE.dependency,
      dash: e.kind === "sync" ? "" : "5 5",
      label: crossesBoundary ? (e.label ?? null) : null,
      from: e.from,
      to: e.to,
      // provisional; the solver below slides labelled pills along the curve
      // to clear every box and every earlier pill.
      lx: (sx + tx) / 2,
      ly: (sy + ty) / 2,
      _bez: [sx, sy, ...(horizontal
        ? [(sx + tx) / 2, sy, (sx + tx) / 2, ty]
        : [sx, (sy + ty) / 2, tx, (sy + ty) / 2]), tx, ty],
      _flip: labelFlip,
    } as DiagEdge & { _bez: number[]; _flip: boolean });
  }

  placeEdgeLabels(out as (DiagEdge & { _bez?: number[]; _flip?: boolean })[],
                  boxes, lanes, boundary.x);

  return { width, height: Math.max(height, y + 10), boxes, edges: out,
           lanes, boundary };
}

// ── edge-label placement — global collision avoidance ────────────────────

interface Rect { x1: number; y1: number; x2: number; y2: number }

const overlapArea = (a: Rect, b: Rect): number => {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  return w > 0 && h > 0 ? w * h : 0;
};

function bez(at: number[], t: number): { x: number; y: number } {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = at;
  const u = 1 - t;
  return {
    x: u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
    y: u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
  };
}

/** Slide each labelled pill along its own curve (then the far side of it)
 *  until it clears every box and every pill placed before it; take the
 *  least-overlapping spot when nothing fully clears. Mirrors the BPMN
 *  condition-chip solver. */
function placeEdgeLabels(
  edges: (DiagEdge & { _bez?: number[]; _flip?: boolean })[],
  boxes: DiagBox[],
  lanes: DiagLane[],
  boundaryX: number,
): void {
  const occupied: Rect[] = boxes.map((b) => ({
    x1: b.x - 4, y1: b.y - 4, x2: b.x + b.w + 4, y2: b.y + b.h + 4,
  }));
  for (const l of lanes)
    occupied.push({ x1: boundaryX + 20, y1: l.y - 24,
                    x2: boundaryX + 20 + l.label.length * 7 + 24, y2: l.y + 2 });
  const T_LADDER = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82,
                    0.12, 0.88];
  for (const e of edges) {
    const b = e._bez;
    if (!e.label || !b) { delete e._bez; delete e._flip; continue; }
    const w = Math.min(e.label.length * 5.4 + 14, 226);
    const h = 17;
    let best: { x: number; y: number; bad: number } | null = null;
    outer: for (const dy of e._flip ? [-12, 12, -26, 26] : [12, -12, 26, -26]) {
      for (const t of T_LADDER) {
        const p = bez(b, t);
        const cx = p.x, cy = p.y + dy;
        const rect: Rect = { x1: cx - w / 2, y1: cy - h / 2,
                             x2: cx + w / 2, y2: cy + h / 2 };
        let bad = 0;
        for (const r of occupied) bad += overlapArea(rect, r);
        bad += Math.abs(t - 0.5) * 8;      // prefer the middle when clear
        if (!best || bad < best.bad) best = { x: cx, y: cy, bad };
        if (bad < 1) break outer;
      }
    }
    if (best) {
      e.lx = best.x;
      e.ly = best.y;
      occupied.push({ x1: best.x - w / 2, y1: best.y - h / 2,
                      x2: best.x + w / 2, y2: best.y + h / 2 });
    }
    delete e._bez;
    delete e._flip;
  }
}

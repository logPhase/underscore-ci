import dagre from "@dagrejs/dagre";
import type { BpmnElement, BpmnFlow } from "./types";

export interface NodeSize {
  w: number;
  h: number;
}

export interface LaidOutNode extends BpmnElement {
  x: number; // center x
  y: number; // center y
  w: number;
  h: number;
}

export interface LaidOutEdge {
  from: string;
  to: string;
  condition?: string;
  points: { x: number; y: number }[];
}

export interface Layout {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  width: number;
  height: number;
}

const GRID = 24;
const snap = (n: number) => Math.round(n / GRID) * GRID;

export function sizeFor(type: BpmnElement["type"]): NodeSize {
  switch (type) {
    case "start-event":
      return { w: 48, h: 48 };
    case "end-event":
      return { w: 52, h: 52 };
    case "exclusive-gateway":
    case "parallel-gateway":
      return { w: 60, h: 60 };
    case "call-activity":
    case "missing-call-activity":
      // Slightly larger than service-task so the `+` marker / "no journey
      // yet" label have breathing room without truncating the title.
      return { w: 260, h: 120 };
    case "service-task":
    case "user-task":
    default:
      // Bumped 200×88 → 240×112 after labels like "Evaluate barrier-
      // open guards (plate authorization, dedup, capacity, output)"
      // were ellipsising at 3 lines. The new height comfortably fits
      // 4 lines of 11.5px mono at lineHeight 1.4, and the extra width
      // gives ~5 more chars per line so most real-world business task
      // labels fit without any truncation at all.
      return { w: 240, h: 112 };
  }
}

export function layoutGraph(
  elements: BpmnElement[],
  flows: BpmnFlow[],
): Layout {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: "LR",
    // Gap tuning history: 120/200 → 160/280 (edge-condition pills were
    // colliding with downstream gateways) → 104/200 (the 160/280 spread
    // left the canvas mostly empty space) → 150/260: task nodes grew
    // 200×88 → 240×112 while spacing stayed at 104/200, so the relative
    // gap shrank and renders came out crammed ("I have to manually move
    // the boxes around to create some space"). Spacing must scale with
    // node size — these values restore the same visual air the 104/200
    // tuning had at the old node dimensions.
    // 150/260 was still "so collapsed — I want more space in between"
    // in practice: labels + condition pills eat the rank gap. 190/330
    // trades fit-zoom for legible air; pan beats squint.
    nodesep: 190,
    ranksep: 330,
    edgesep: 80,
    marginx: 48,
    marginy: 48,
    ranker: "tight-tree",
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const el of elements) {
    const s = sizeFor(el.type);
    g.setNode(el.id, { width: s.w, height: s.h });
  }

  flows.forEach((f, i) => {
    // Bias yes/positive branches upward by lower weight on negative
    const negative = f.condition && /^(no|false|deny|reject)$/i.test(f.condition);
    g.setEdge(f.from, f.to, { weight: negative ? 1 : 3, minlen: 1 }, `e${i}`);
  });

  dagre.layout(g);

  const nodes: LaidOutNode[] = elements.map((el) => {
    const n = g.node(el.id);
    const s = sizeFor(el.type);
    return {
      ...el,
      x: snap(n.x),
      y: snap(n.y),
      w: s.w,
      h: s.h,
    };
  });

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Group flows by source and target so we can fan multiple connections
  // out along the source's right edge / target's left edge instead of
  // stacking them at one point. Without this, e.g. a gateway with three
  // outflows draws all three from (right-center) and they overlap
  // visually until they diverge — looking like a single line.
  const outflowsByFrom = new Map<string, number>();
  const inflowsByTo = new Map<string, number>();
  for (const f of flows) {
    outflowsByFrom.set(f.from, (outflowsByFrom.get(f.from) ?? 0) + 1);
    inflowsByTo.set(f.to, (inflowsByTo.get(f.to) ?? 0) + 1);
  }
  const outIndex = new Map<string, number>();
  const inIndex = new Map<string, number>();

  const edges: LaidOutEdge[] = flows.map((f) => {
    const a = nodeById.get(f.from)!;
    const b = nodeById.get(f.to)!;
    const oi = outIndex.get(f.from) ?? 0;
    const ii = inIndex.get(f.to) ?? 0;
    outIndex.set(f.from, oi + 1);
    inIndex.set(f.to, ii + 1);
    const oTotal = outflowsByFrom.get(f.from) ?? 1;
    const iTotal = inflowsByTo.get(f.to) ?? 1;
    const sourceIsGateway =
      a.type === "exclusive-gateway" || a.type === "parallel-gateway";
    const targetIsGateway =
      b.type === "exclusive-gateway" || b.type === "parallel-gateway";
    return {
      from: f.from,
      to: f.to,
      condition: f.condition,
      points: orthogonalPath(
        a,
        b,
        oi,
        oTotal,
        ii,
        iTotal,
        sourceIsGateway,
        targetIsGateway,
      ),
    };
  });

  const { width, height } = g.graph() as { width: number; height: number };

  return { nodes, edges, width: width || 0, height: height || 0 };
}

/**
 * Elbow router. When a node has multiple outflows or inflows, spread the
 * connection points along its right/left edge so the routes don't stack.
 *
 * `oi/oTotal` = this edge is the oi-th of oTotal outflows from `a`.
 * `ii/iTotal` = this edge is the ii-th of iTotal inflows to `b`.
 *
 * Each elbow's x-jog also gets a small per-edge stagger (8px) so when two
 * edges turn at almost the same x they don't trace the same vertical line.
 */
function orthogonalPath(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  oi: number,
  oTotal: number,
  ii: number,
  iTotal: number,
  sourceIsGateway: boolean,
  targetIsGateway: boolean,
): { x: number; y: number }[] {
  const fanY = (h: number, idx: number, total: number) => {
    if (total <= 1) return 0;
    const span = h * 0.6;
    const step = span / (total - 1);
    return -span / 2 + idx * step;
  };

  // Choose the connection point on the source/target shape.
  //
  // Diamonds (gateways): route from the corner that points TOWARD the
  // target. Above-target → exit from top corner; below → bottom; same row
  // → right (for source) or left (for target). This produces the classic
  // "yes leaves from the right corner, no leaves from the bottom corner"
  // BPMN look.
  //
  // Rectangles/circles: enter/exit from the side perpendicular to flow
  // direction (right edge for source, left edge for target).
  const dy = b.y - a.y;
  let ax: number, ay: number;
  if (sourceIsGateway && Math.abs(dy) > 8) {
    // Exit from top or bottom corner of diamond
    ax = a.x;
    ay = dy > 0 ? a.y + a.h / 2 : a.y - a.h / 2;
  } else {
    ax = a.x + a.w / 2;
    ay = a.y + fanY(a.h, oi, oTotal);
  }

  let bx: number, by: number;
  if (targetIsGateway && Math.abs(dy) > 8) {
    // Enter from top or bottom corner of diamond
    bx = b.x;
    by = dy > 0 ? b.y - b.h / 2 : b.y + b.h / 2;
  } else {
    bx = b.x - b.w / 2;
    by = b.y + fanY(b.h, ii, iTotal);
  }

  if (Math.abs(ay - by) < 1) {
    return [
      { x: ax, y: ay },
      { x: bx, y: by },
    ];
  }

  // For gateway-source vertical exits, the vertical leg is short (just to
  // the column) and then horizontal — produces a clean L shape.
  if (sourceIsGateway && ax === a.x) {
    // Move down/up from the corner, then turn right to the target column,
    // then approach.
    const verticalEndY = ay + (dy > 0 ? 24 : -24);
    return [
      { x: ax, y: ay },
      { x: ax, y: verticalEndY },
      { x: bx, y: verticalEndY },
      { x: bx, y: by },
    ];
  }

  const stagger = oi * 8;
  const midX = ax + Math.max(24, (bx - ax) / 2) + stagger;
  return [
    { x: ax, y: ay },
    { x: midX, y: ay },
    { x: midX, y: by },
    { x: bx, y: by },
  ];
}

export function pointsToPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  return pts
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");
}

/** Position along a polyline at fraction `t` of total length (t∈[0,1]).
 *  Used to bias edge-condition labels off-centre so they don't sit on
 *  top of the target node. midpointOnPath(pts) === pointAlongPath(pts, 0.5). */
export function pointAlongPath(
  pts: { x: number; y: number }[],
  t: number,
): { x: number; y: number } {
  if (pts.length < 2) return pts[0] ?? { x: 0, y: 0 };
  let total = 0;
  const segs: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segs.push(d);
    total += d;
  }
  const clamped = Math.max(0, Math.min(1, t));
  let target = total * clamped;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i]) {
      const tt = segs[i] === 0 ? 0 : target / segs[i];
      const a = pts[i];
      const b = pts[i + 1];
      return { x: a.x + (b.x - a.x) * tt, y: a.y + (b.y - a.y) * tt };
    }
    target -= segs[i];
  }
  return pts[pts.length - 1];
}

export function midpointOnPath(pts: { x: number; y: number }[]): { x: number; y: number } {
  if (pts.length < 2) return pts[0] ?? { x: 0, y: 0 };
  // Walk segments, find half total length
  let total = 0;
  const segs: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segs.push(d);
    total += d;
  }
  let target = total / 2;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i]) {
      const t = target / segs[i];
      const a = pts[i];
      const b = pts[i + 1];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    target -= segs[i];
  }
  return pts[pts.length - 1];
}

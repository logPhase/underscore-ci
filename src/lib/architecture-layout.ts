/** Deterministic layered layout for the repository architecture diagram.
 *
 *  The system reads top-to-bottom by layer (API → Application → Domain →
 *  Infrastructure → external systems), the way an architect stacks a
 *  container diagram. Within a layer, nodes flow left→right wrapping at a
 *  fixed column count. Positions are computed here (never measured from the
 *  DOM), so node cards can be absolutely positioned over an SVG edge layer
 *  with pixel-exact connectors and no layout race.
 */
import type {
  ArchEdge,
  ArchLayer,
  ArchNode,
  ArchNodeKind,
} from "@/types/architecture";

export const CARD_W = 216;
const CARD_H = 84; // component/service/datastore/external
const PILL_H = 46; // topic
const COL_GAP = 34;
const ROW_GAP = 30;
const BAND_HEADER_H = 34;
const BAND_GAP = 26;
const PAD = 28;
const COLS = 4;

/** Nodes with no layer of these kinds collect in a trailing systems band. */
const SYSTEM_KINDS: ArchNodeKind[] = ["topic", "datastore", "external"];

export interface PlacedNode {
  node: ArchNode;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedBand {
  id: string;
  name: string;
  description?: string | null;
  y: number;
  height: number;
  synthetic: boolean; // the generated "external systems" band
}

export interface RoutedEdge {
  edge: ArchEdge;
  d: string;
  labelX: number;
  labelY: number;
}

export interface ArchLayout {
  width: number;
  height: number;
  bands: PlacedBand[];
  nodes: PlacedNode[];
  edges: RoutedEdge[];
  placed: Map<string, PlacedNode>;
}

const nodeHeight = (n: ArchNode): number => (n.kind === "topic" ? PILL_H : CARD_H);

/** Order the layers: named layers in payload order first, then a synthesized
 *  "External systems" band for un-layered stores/topics/externals, then an
 *  "Other" band for anything else without a layer. */
function orderedBandKeys(
  layers: ArchLayer[],
  nodes: ArchNode[]
): { id: string; name: string; description?: string | null; synthetic: boolean }[] {
  const named = new Map(layers.map((l) => [l.id, l]));
  const used = new Set<string>();
  const out: { id: string; name: string; description?: string | null; synthetic: boolean }[] = [];
  // Named layers in given order — only those that actually hold a node.
  for (const l of layers) {
    if (nodes.some((n) => n.layer === l.id)) {
      out.push({ id: l.id, name: l.name, description: l.description, synthetic: false });
      used.add(l.id);
    }
  }
  // Any layer id referenced by a node but not declared → keep it (honest).
  for (const n of nodes) {
    const lid = n.layer;
    if (lid && !used.has(lid) && !named.has(lid)) {
      used.add(lid);
      out.push({ id: lid, name: titleCase(lid), synthetic: false });
    }
  }
  const unlayered = nodes.filter((n) => !n.layer);
  const systems = unlayered.filter((n) => SYSTEM_KINDS.includes(n.kind));
  const others = unlayered.filter((n) => !SYSTEM_KINDS.includes(n.kind));
  if (others.length)
    out.push({ id: "__other", name: "Components", synthetic: true });
  if (systems.length)
    out.push({ id: "__systems", name: "External systems & data", synthetic: true });
  return out;
}

function titleCase(s: string): string {
  const w = s.replace(/[-_]+/g, " ").trim();
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** Which band a node belongs to. */
function bandOf(n: ArchNode): string {
  if (n.layer) return n.layer;
  return SYSTEM_KINDS.includes(n.kind) ? "__systems" : "__other";
}

export function layoutArchitecture(
  nodes: ArchNode[],
  edges: ArchEdge[],
  layers: ArchLayer[]
): ArchLayout {
  const bandDefs = orderedBandKeys(layers, nodes);
  const placed = new Map<string, PlacedNode>();
  const placedNodes: PlacedNode[] = [];
  const bands: PlacedBand[] = [];

  let cursorY = PAD;
  let maxRight = 0;

  for (const b of bandDefs) {
    const members = nodes.filter((n) => bandOf(n) === b.id);
    if (!members.length) continue;
    const bandTop = cursorY;
    const rows = Math.ceil(members.length / COLS);
    members.forEach((node, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const w = CARD_W;
      const h = nodeHeight(node);
      const x = PAD + col * (CARD_W + COL_GAP);
      // Vertically center within its row slot (rows use max card height).
      const rowTop = bandTop + BAND_HEADER_H + row * (CARD_H + ROW_GAP);
      const y = rowTop + (CARD_H - h) / 2;
      const p: PlacedNode = { node, x, y, w, h };
      placed.set(node.id, p);
      placedNodes.push(p);
      maxRight = Math.max(maxRight, x + w);
    });
    const bandHeight = BAND_HEADER_H + rows * CARD_H + (rows - 1) * ROW_GAP;
    bands.push({
      id: b.id,
      name: b.name,
      description: b.description,
      y: bandTop,
      height: bandHeight,
      synthetic: b.synthetic,
    });
    cursorY = bandTop + bandHeight + BAND_GAP;
  }

  const width = maxRight + PAD;
  const height = cursorY - BAND_GAP + PAD;

  const routed: RoutedEdge[] = [];
  for (const edge of edges) {
    const a = placed.get(edge.from);
    const b = placed.get(edge.to);
    if (!a || !b) continue; // edge to a node not in this diagram — skip quietly
    routed.push(routeEdge(edge, a, b));
  }

  return { width, height, bands, nodes: placedNodes, edges: routed, placed };
}

/** Bezier connector between two placed cards. Downward when the target sits
 *  in a lower band (the common case — flow reads top→down); horizontal for
 *  same-row; upward otherwise. */
function routeEdge(edge: ArchEdge, a: PlacedNode, b: PlacedNode): RoutedEdge {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  let sx: number, sy: number, ex: number, ey: number, c1x: number, c1y: number, c2x: number, c2y: number;
  const vGap = 22;
  if (bc.y - ac.y > a.h) {
    // downward
    sx = ac.x; sy = a.y + a.h; ex = bc.x; ey = b.y;
    c1x = sx; c1y = sy + vGap + (ey - sy) * 0.3;
    c2x = ex; c2y = ey - vGap - (ey - sy) * 0.3;
  } else if (ac.y - bc.y > a.h) {
    // upward
    sx = ac.x; sy = a.y; ex = bc.x; ey = b.y + b.h;
    c1x = sx; c1y = sy - vGap;
    c2x = ex; c2y = ey + vGap;
  } else {
    // same band — horizontal
    const rightward = bc.x >= ac.x;
    sx = rightward ? a.x + a.w : a.x;
    sy = ac.y;
    ex = rightward ? b.x : b.x + b.w;
    ey = bc.y;
    const hGap = 26;
    c1x = sx + (rightward ? hGap : -hGap); c1y = sy;
    c2x = ex + (rightward ? -hGap : hGap); c2y = ey;
  }
  const d = `M ${sx},${sy} C ${c1x},${c1y} ${c2x},${c2y} ${ex},${ey}`;
  return { edge, d, labelX: (sx + ex) / 2, labelY: (sy + ey) / 2 };
}

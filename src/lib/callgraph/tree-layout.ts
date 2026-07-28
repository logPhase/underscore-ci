import type {
  Chapter,
  ChapterStep,
  StepKind,
  StepPRStatus,
} from "@/types/journey";
import { buildChildMap, deriveRoots, normalizeEdges } from "./forest";

// The call-graph tree layout, extracted from CallFlowChart so both the
// SVG renderer and the React Flow renderer (CallFlowGraph) share ONE
// deterministic pipeline: buildForest → filter by expansion → lay out →
// flatten to positioned nodes + edges. Pure + unit-testable.

export type PRChangeType = StepPRStatus | null;

export interface TreeNode {
  fqn: string;
  name: string;
  className: string;
  children: TreeNode[];
  childCount: number;
  depth: number;
  x: number;
  y: number;
  width: number;
  bodyLength: number;
  isTrivial: boolean;
  seq: number;
  prChange: PRChangeType;
  kind?: StepKind;
}

export const NODE_W = 200;
export const NODE_H = 50;
export const H_GAP = 20;
export const V_GAP = 56;

function shortName(fqn: string): string {
  const base = fqn.replace(/\(.*\)$/, "");
  const parts = base.split(".");
  return parts[parts.length - 1] || fqn;
}

function classNameOf(fqn: string): string {
  const base = fqn.replace(/\(.*\)$/, "");
  const parts = base.split(".");
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}

const TRIVIAL_NAMES = new Set([
  "LogInformation",
  "LogWarning",
  "LogError",
  "LogDebug",
  "LogTrace",
  "LogWithProperties",
  "AddTag",
  "SetStatus",
  "RecordException",
  "ToString",
  "GetHashCode",
  "Equals",
  "Dispose",
  "DisposeAsync",
]);

function isTrivialMethod(name: string, bodyLength: number): boolean {
  if (TRIVIAL_NAMES.has(name)) return true;
  if (name.startsWith("get_") || name.startsWith("set_")) return true;
  if (bodyLength > 0 && bodyLength < 100) return true;
  return false;
}

function buildForest(
  functions: string[],
  edges: { from: string; to: string }[],
  steps: ChapterStep[],
  prChanges: Map<string, PRChangeType>,
): TreeNode[] {
  if (!functions.length && !edges.length) return [];
  const stepByFqn = new Map<string, ChapterStep>();
  const seqMap = new Map<string, number>();
  steps.forEach((s, i) => {
    if (!stepByFqn.has(s.fqn)) stepByFqn.set(s.fqn, s);
    if (!seqMap.has(s.fqn)) seqMap.set(s.fqn, i + 1);
  });
  const { childMap } = buildChildMap(edges);
  const roots = deriveRoots(functions, edges);
  const visited = new Set<string>();
  function build(fqn: string, depth: number): TreeNode {
    visited.add(fqn);
    const step = stepByFqn.get(fqn);
    const children: TreeNode[] = [];
    for (const c of childMap.get(fqn) || []) {
      if (visited.has(c)) continue;
      children.push(build(c, depth + 1));
    }
    const childCount = children.reduce((s, c) => s + 1 + c.childCount, 0);
    const name = step?.name || shortName(fqn);
    const bodyLength = (step?.body || "").length;
    const node: TreeNode = {
      fqn,
      name,
      className: step?.class || classNameOf(fqn),
      children,
      childCount,
      depth,
      x: 0,
      y: 0,
      width: 0,
      bodyLength,
      isTrivial: isTrivialMethod(name, bodyLength),
      prChange: prChanges.get(fqn) || null,
      seq: seqMap.get(fqn) || 0,
    };
    if (step?.kind) node.kind = step.kind;
    return node;
  }
  const forest: TreeNode[] = [];
  for (const r of roots) {
    if (visited.has(r)) continue;
    forest.push(build(r, 0));
  }
  return forest;
}

function filterTree(node: TreeNode, expanded: Set<string>): TreeNode {
  const isExpanded = expanded.has(node.fqn);
  const visibleChildren = isExpanded
    ? node.children.map((c) => filterTree(c, expanded))
    : [];
  return { ...node, children: visibleChildren };
}

function layoutTree(node: TreeNode, startX = 0): number {
  if (node.children.length === 0) {
    node.width = NODE_W;
    node.x = startX;
    node.y = node.depth * (NODE_H + V_GAP);
    return NODE_W;
  }
  let totalWidth = 0;
  let x = startX;
  for (const child of node.children) {
    const w = layoutTree(child, x);
    x += w + H_GAP;
    totalWidth += w + H_GAP;
  }
  totalWidth -= H_GAP;
  node.width = totalWidth;
  node.x = startX + totalWidth / 2 - NODE_W / 2;
  node.y = node.depth * (NODE_H + V_GAP);
  return totalWidth;
}

function flattenTree(node: TreeNode): {
  nodes: TreeNode[];
  edges: { from: TreeNode; to: TreeNode }[];
} {
  const nodes: TreeNode[] = [];
  const edges: { from: TreeNode; to: TreeNode }[] = [];
  function walk(n: TreeNode) {
    nodes.push(n);
    for (const child of n.children) {
      edges.push({ from: n, to: child });
      walk(child);
    }
  }
  walk(node);
  return { nodes, edges };
}

// Class-based hue assignment — stable per class within a session.
const SERVICE_HUES: Record<string, string> = {};
let hueIdx = 0;
const HUES = [174, 210, 280, 150, 35, 340, 200, 50];

export function getHue(cls: string): number {
  if (!SERVICE_HUES[cls]) {
    SERVICE_HUES[cls] = String(HUES[hueIdx % HUES.length]);
    hueIdx++;
  }
  return parseInt(SERVICE_HUES[cls]);
}

/** The whole pipeline: chapter + expansion set → positioned nodes + edges.
 *  `expanded` gates which children are visible; each forest root is laid out
 *  side by side so no component is hidden. `childCount > 0` marks an
 *  expandable node. */
export function buildCallGraphLayout(
  chapter: Chapter,
  expanded: Set<string>,
): { nodes: TreeNode[]; edges: { from: TreeNode; to: TreeNode }[] } {
  const prChanges = new Map<string, PRChangeType>();
  for (const step of chapter.steps || []) {
    if (step.fqn && step.prStatus) prChanges.set(step.fqn, step.prStatus);
  }
  const edges = normalizeEdges(chapter.edges as unknown[]);
  const forest = buildForest(
    chapter.functions,
    edges,
    chapter.steps || [],
    prChanges,
  );
  if (forest.length === 0) return { nodes: [], edges: [] };
  const filtered = forest.map((r) => filterTree(r, expanded));
  let x = 0;
  for (const r of filtered) {
    x += layoutTree(r, x) + H_GAP * 2;
  }
  const nodes: TreeNode[] = [];
  const flatEdges: { from: TreeNode; to: TreeNode }[] = [];
  for (const r of filtered) {
    const f = flattenTree(r);
    nodes.push(...f.nodes);
    flatEdges.push(...f.edges);
  }
  return { nodes, edges: flatEdges };
}

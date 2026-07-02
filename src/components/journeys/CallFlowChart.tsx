import { useMemo, useRef, useEffect } from "react";
import { HelpCircle } from "lucide-react";
import { Chapter, ChapterStep, StepKind, StepPRStatus } from "@/types/journey";
import { useJourneyUIStore } from "@/store/use-journey-ui-store";

interface CallFlowChartProps {
  chapter: Chapter;
  compact?: boolean;
  expanded: Set<string>;
  onToggleExpand: (fqn: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  /** Ref whose `.current` names the fqn to scroll/center on next layout. */
  scrollRequestRef?: React.MutableRefObject<string | null>;
}

type PRChangeType = StepPRStatus | null;

interface TreeNode {
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
  /** Present when this node represents an interface/abstract contract. */
  kind?: StepKind;
}

const PR_CHANGE_COLORS: Record<
  StepPRStatus,
  { bg: string; border: string; text: string; label: string; icon: string }
> = {
  added: {
    bg: "hsla(145, 50%, 14%, 0.95)",
    border: "hsl(145, 50%, 38%)",
    text: "hsl(145, 55%, 62%)",
    label: "added",
    icon: "+",
  },
  modified: {
    bg: "hsla(35, 50%, 14%, 0.95)",
    border: "hsl(35, 55%, 42%)",
    text: "hsl(35, 60%, 62%)",
    label: "modified",
    icon: "~",
  },
  deleted: {
    bg: "hsla(0, 45%, 14%, 0.95)",
    border: "hsl(0, 50%, 42%)",
    text: "hsl(0, 55%, 62%)",
    label: "deleted",
    icon: "-",
  },
  disconnected: {
    bg: "hsla(220, 15%, 13%, 0.95)",
    border: "hsl(220, 10%, 38%)",
    text: "hsl(220, 12%, 65%)",
    label: "disconnected",
    icon: "⦸",
  },
};

/** Styling for interface/abstract contract steps. */
const INTERFACE_STYLES = {
  interface: {
    border: "hsl(265, 50%, 55%)",
    text: "hsl(265, 55%, 75%)",
    label: "interface",
    icon: "◇",
  },
  abstract: {
    border: "hsl(210, 45%, 55%)",
    text: "hsl(210, 55%, 75%)",
    label: "abstract",
    icon: "◆",
  },
} as const;

function shortName(fqn: string): string {
  const base = fqn.replace(/\(.*\)$/, "");
  const parts = base.split(".");
  return parts[parts.length - 1] || fqn;
}

function className(fqn: string): string {
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

function buildTree(
  functions: string[],
  edges: { from: string; to: string }[],
  steps: ChapterStep[],
  prChanges: Map<string, PRChangeType>
): TreeNode | null {
  if (!functions.length) return null;

  const stepByFqn = new Map<string, ChapterStep>();
  const seqMap = new Map<string, number>();
  steps.forEach((s, i) => {
    if (!stepByFqn.has(s.fqn)) stepByFqn.set(s.fqn, s);
    if (!seqMap.has(s.fqn)) seqMap.set(s.fqn, i + 1);
  });

  // childMap is deduped: multiple edges between the same (from, to) pair
  // (e.g. an interface called on two different code paths in the same body)
  // must not turn into two tree children, or React keys collide.
  const childMap: Record<string, string[]> = {};
  const seenEdge = new Set<string>();
  const hasParent = new Set<string>();

  for (const e of edges) {
    const key = e.from + "\u0000" + e.to;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    if (!childMap[e.from]) childMap[e.from] = [];
    childMap[e.from].push(e.to);
    hasParent.add(e.to);
  }

  const root = functions.find((f) => !hasParent.has(f)) || functions[0];

  const visited = new Set<string>();
  function build(fqn: string, depth: number): TreeNode {
    visited.add(fqn);
    const step = stepByFqn.get(fqn);
    // Check visited inside the loop — the filter-then-map pattern lets later
    // siblings inherit `visited` additions from earlier siblings' sub-walks,
    // which is how we keep a child that's reachable via two parents from
    // being rendered twice (and colliding on React keys).
    const children: TreeNode[] = [];
    for (const c of childMap[fqn] || []) {
      if (visited.has(c)) continue;
      children.push(build(c, depth + 1));
    }
    const childCount = children.reduce((s, c) => s + 1 + c.childCount, 0);
    const name = step?.name || shortName(fqn);
    const bodyLength = (step?.body || "").length;
    const node: TreeNode = {
      fqn,
      name,
      className: step?.class || className(fqn),
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

  return build(root, 0);
}

function filterTree(node: TreeNode, expanded: Set<string>): TreeNode {
  const isExpanded = expanded.has(node.fqn);
  const visibleChildren = isExpanded
    ? node.children.map((c) => filterTree(c, expanded))
    : [];
  return { ...node, children: visibleChildren };
}

// Layout constants — wider nodes, more breathing room
const NODE_W = 200;
const NODE_H = 50;
const H_GAP = 20;
const V_GAP = 56;

function layoutTree(node: TreeNode, startX: number = 0): number {
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

// Class-based hue assignment
const SERVICE_HUES: Record<string, string> = {};
let hueIdx = 0;
const HUES = [174, 210, 280, 150, 35, 340, 200, 50];

function getHue(cls: string): number {
  if (!SERVICE_HUES[cls]) {
    SERVICE_HUES[cls] = String(HUES[hueIdx % HUES.length]);
    hueIdx++;
  }
  return parseInt(SERVICE_HUES[cls]);
}

// Truncate text to fit within a pixel width (rough approximation: 7px/char for mono 11px)
function truncate(text: string, maxPx: number, fontSize: number = 11): string {
  const charW = fontSize * 0.62;
  const maxChars = Math.floor(maxPx / charW);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + "\u2026";
}

const CallFlowChart: React.FC<CallFlowChartProps> = ({
  chapter,
  compact = false,
  expanded,
  onToggleExpand,
  onExpandAll,
  onCollapseAll,
  scrollRequestRef,
}) => {
  const {
    hoveredFunctionId,
    setHoveredFunctionId,
    activeFunctionId,
    setActiveFunctionId,
  } = useJourneyUIStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const toggleExpand = onToggleExpand;
  const expandAll = onExpandAll;
  const collapseAll = onCollapseAll;

  // PR changes map: read directly from the chapter's steps (prStatus is baked in)
  const prChanges = useMemo(() => {
    const m = new Map<string, PRChangeType>();
    for (const step of chapter.steps) {
      if (step.fqn && step.prStatus) m.set(step.fqn, step.prStatus);
    }
    return m;
  }, [chapter.steps]);

  // Collect all PR-changed nodes (ordered by their sequence in the tree).
  // Kept so the summary pills can show per-type counts in the chart header.
  const prChangedFqns = useMemo(() => {
    if (prChanges.size === 0) return [];
    return chapter.functions.filter((fqn) => prChanges.has(fqn));
  }, [chapter.functions, prChanges]);

  const { tree, flat } = useMemo(() => {
    const edges = chapter.edges.map((e) =>
      typeof e === "object" && "from" in e
        ? e
        : { from: (e as string[])[0], to: (e as string[])[1] }
    );
    const fullTree = buildTree(
      chapter.functions,
      edges,
      chapter.steps || [],
      prChanges
    );
    if (!fullTree) return { tree: null, flat: { nodes: [], edges: [] } };

    const filtered = filterTree(fullTree, expanded);
    layoutTree(filtered);
    return { tree: filtered, flat: flattenTree(filtered) };
  }, [chapter.edges, chapter.functions, chapter.steps, prChanges, expanded]);

  // Ancestry chain from root → activeFunctionId. Used to light up the whole
  // execution path when cycling through PR changes. Mirrors buildTree's
  // DFS-from-root so the highlighted path matches the rendered tree (a
  // last-edge-wins parent map disagreed when nodes had multiple incoming edges).
  const activePath = useMemo(() => {
    const path = new Set<string>();
    if (!activeFunctionId) return path;
    const edges = chapter.edges.map((e) =>
      typeof e === "object" && "from" in e
        ? e
        : { from: (e as string[])[0], to: (e as string[])[1] }
    );
    const childMap: Record<string, string[]> = {};
    const seenEdge = new Set<string>();
    const hasParent = new Set<string>();
    for (const e of edges) {
      const key = e.from + " " + e.to;
      if (seenEdge.has(key)) continue;
      seenEdge.add(key);
      if (!childMap[e.from]) childMap[e.from] = [];
      childMap[e.from].push(e.to);
      hasParent.add(e.to);
    }
    const root =
      chapter.functions.find((f) => !hasParent.has(f)) || chapter.functions[0];
    const treeParent = new Map<string, string>();
    const visited = new Set<string>();
    (function dfs(n: string) {
      visited.add(n);
      for (const c of childMap[n] || []) {
        if (visited.has(c)) continue;
        treeParent.set(c, n);
        dfs(c);
      }
    })(root);
    let cur: string | undefined = activeFunctionId;
    while (cur && !path.has(cur)) {
      path.add(cur);
      cur = treeParent.get(cur);
    }
    return path;
  }, [activeFunctionId, chapter.edges, chapter.functions]);

  // Scroll to node using its layout position within the scroll container.
  // Only fires when the parent sets scrollRequestRef (e.g. PR nav) — raw
  // clicks on nodes should not re-center the viewport under the user.
  useEffect(() => {
    const fqn = scrollRequestRef?.current;
    if (!fqn || !scrollContainerRef.current) return;
    scrollRequestRef.current = null;

    requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const el = container.querySelector(
        `[data-fqn="${CSS.escape(fqn)}"]`
      ) as SVGGElement | null;
      if (!el) return;

      const svgRect = container.querySelector("svg")?.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      if (!svgRect) return;

      const nodeRelX = elRect.left - svgRect.left + elRect.width / 2;
      const nodeRelY = elRect.top - svgRect.top + elRect.height / 2;

      container.scrollTo({
        left: Math.max(0, nodeRelX - container.clientWidth / 2),
        top: Math.max(0, nodeRelY - container.clientHeight / 2),
        behavior: "smooth",
      });
    });
  }, [activeFunctionId, flat.nodes, scrollRequestRef]);

  const padding = 40;
  const maxX = Math.max(...flat.nodes.map((n) => n.x + NODE_W)) + padding;
  const maxY = Math.max(...flat.nodes.map((n) => n.y + NODE_H)) + padding;
  const svgW = maxX + padding;
  const svgH = maxY + padding;

  // Group PR changes by type for the summary
  const prSummary = useMemo(() => {
    const groups: Record<
      string,
      {
        fqns: string[];
        style: {
          bg: string;
          border: string;
          text: string;
          label: string;
          icon: string;
        };
      }
    > = {};
    for (const fqn of prChangedFqns) {
      const change = prChanges.get(fqn)!;
      if (!groups[change])
        groups[change] = { fqns: [], style: PR_CHANGE_COLORS[change] };
      groups[change].fqns.push(fqn);
    }
    return groups;
  }, [prChangedFqns, prChanges]);

  if (!tree || flat.nodes.length === 0) return null;

  return (
    <div className="flex h-full flex-col overflow-hidden border border-zinc-800/40">
      {/* Header bar — Execution Flow label, PR change pills, visible count,
          and expand/collapse. PR prev/next nav lives in the ChapterView top
          bar so it stays anchored right of the status badge. */}
      {!compact && (
        <div
          className="flex flex-wrap items-center gap-3 border-b border-zinc-800/40 px-4 py-2"
          style={{
            background:
              prChangedFqns.length > 0
                ? "hsla(35, 18%, 8%, 0.85)"
                : "var(--bpmn-bg)",
          }}
        >
          <div
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: "hsl(174, 60%, 50%)" }}
          />
          <span className="font-mono text-[11px] tracking-wider text-zinc-400 uppercase">
            Execution Flow
          </span>

          {/* Legend — hover popover so first-time users can decode the color
              language without leaving the view. Aria-hidden because the same
              info is conveyed by tooltips on individual nodes/edges. */}
          <div className="group/legend relative">
            <button
              type="button"
              aria-label="Show chart legend"
              className="flex h-5 w-5 items-center justify-center rounded text-zinc-600 transition-colors hover:bg-zinc-800/60 hover:text-zinc-300"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
            <div
              className="absolute top-full left-0 z-30 mt-2 hidden w-72 rounded-lg border border-zinc-700/80 bg-zinc-950/95 p-3 font-mono text-[11px] shadow-xl backdrop-blur-sm group-hover/legend:block"
              role="tooltip"
            >
              <div className="mb-2 text-[10px] tracking-wider text-zinc-400 uppercase">
                Legend
              </div>
              <div className="space-y-2">
                <div>
                  <div className="mb-1 text-zinc-500">Node status</div>
                  <ul className="space-y-1 text-zinc-300">
                    {(
                      Object.entries(PR_CHANGE_COLORS) as [
                        StepPRStatus,
                        (typeof PR_CHANGE_COLORS)[StepPRStatus],
                      ][]
                    ).map(([k, s]) => (
                      <li key={k} className="flex items-center gap-2">
                        <span
                          className="inline-flex h-5 w-5 items-center justify-center rounded font-bold"
                          style={{
                            background: s.bg,
                            border: `1px solid ${s.border}`,
                            color: s.text,
                          }}
                        >
                          {s.icon}
                        </span>
                        <span>{s.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="mt-2 mb-1 text-zinc-500">Method kind</div>
                  <ul className="space-y-1 text-zinc-300">
                    <li className="flex items-center gap-2">
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded"
                        style={{
                          color: INTERFACE_STYLES.interface.text,
                          border: `1px solid ${INTERFACE_STYLES.interface.border}`,
                        }}
                      >
                        ◇
                      </span>
                      <span>interface contract</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded"
                        style={{
                          color: INTERFACE_STYLES.abstract.text,
                          border: `1px solid ${INTERFACE_STYLES.abstract.border}`,
                        }}
                      >
                        ◆
                      </span>
                      <span>abstract method</span>
                    </li>
                  </ul>
                </div>
                <div>
                  <div className="mt-2 mb-1 text-zinc-500">Edge / call</div>
                  <ul className="space-y-1 text-zinc-300">
                    <li className="flex items-center gap-2">
                      <svg width="32" height="6">
                        <path
                          d="M0 3 L32 3"
                          stroke="hsla(210,14%,55%,0.9)"
                          strokeWidth="1.5"
                        />
                      </svg>
                      <span>call edge</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <svg width="32" height="6">
                        <path
                          d="M0 3 L32 3"
                          stroke="hsl(0,50%,52%)"
                          strokeWidth="1.5"
                          strokeDasharray="4 3"
                        />
                      </svg>
                      <span>removed / disconnected</span>
                    </li>
                  </ul>
                </div>
                <div>
                  <div className="mt-2 mb-1 text-zinc-500">Corner badge</div>
                  <ul className="space-y-1 text-zinc-300">
                    <li>
                      <span className="text-emerald-400">+N</span> new call
                      sites added
                    </li>
                    <li>
                      <span className="text-red-400">−N</span> call sites
                      removed
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {prChangedFqns.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {Object.entries(prSummary).map(([type, { fqns, style }]) => (
                <span
                  key={type}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px]"
                  style={{
                    background: style.bg,
                    border: `1px solid ${style.border}`,
                    color: style.text,
                  }}
                >
                  <span className="font-bold">{style.icon}</span>
                  {fqns.length} {style.label}
                </span>
              ))}
            </div>
          )}

          <div className="flex-1" />

          <span
            className="font-mono text-[10px] text-zinc-500 tabular-nums"
            title={`${flat.nodes.length} of ${chapter.functions.length} methods currently expanded in the call tree`}
          >
            <span className="text-zinc-300">{flat.nodes.length}</span>
            <span className="text-zinc-700"> / </span>
            <span className="text-zinc-500">{chapter.functions.length}</span>
            <span className="ml-1 text-zinc-600">shown</span>
          </span>
          <button
            onClick={expandAll}
            className="rounded px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-zinc-300"
          >
            Expand all
          </button>
          <button
            onClick={collapseAll}
            className="rounded px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-zinc-300"
          >
            Collapse
          </button>
        </div>
      )}

      {/* SVG chart */}
      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-auto"
        style={{ background: "var(--bpmn-bg-deep)" }}
      >
        <svg
          ref={svgRef}
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="mx-auto"
        >
          <defs>
            <filter id="flow-glow">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="pr-glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Edges with smooth curves */}
          {flat.edges.map((e, i) => {
            const x1 = e.from.x + padding + NODE_W / 2;
            const y1 = e.from.y + padding + NODE_H;
            const x2 = e.to.x + padding + NODE_W / 2;
            const y2 = e.to.y + padding;
            const hue = getHue(e.from.className);
            const onPath =
              activePath.has(e.from.fqn) && activePath.has(e.to.fqn);
            const isActive = onPath;
            const hasPrChange = e.to.prChange !== null;

            // Smooth cubic bezier with slight S-curve
            const dy = y2 - y1;
            const cp1y = y1 + dy * 0.4;
            const cp2y = y2 - dy * 0.4;

            const edgeStroke = isActive
              ? `hsl(${hue}, 70%, 62%)`
              : hasPrChange
                ? PR_CHANGE_COLORS[e.to.prChange!]?.border ||
                  "hsla(35, 50%, 40%, 0.6)"
                : "hsla(210, 14%, 36%, 0.7)";

            return (
              <g key={i}>
                {/* Wider hit area for hover */}
                <path
                  d={`M ${x1} ${y1} C ${x1} ${cp1y}, ${x2} ${cp2y}, ${x2} ${y2}`}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={8}
                />
                {/* Visible edge */}
                <path
                  d={`M ${x1} ${y1} C ${x1} ${cp1y}, ${x2} ${cp2y}, ${x2} ${y2}`}
                  fill="none"
                  stroke={edgeStroke}
                  strokeWidth={isActive ? 2.5 : hasPrChange ? 2 : 1.5}
                  strokeDasharray={
                    e.to.prChange === "deleted" ||
                    e.to.prChange === "disconnected"
                      ? "4 3"
                      : "none"
                  }
                  style={{ transition: "stroke 0.2s, stroke-width 0.2s" }}
                />
                {/* Arrow tip */}
                <circle
                  cx={x2}
                  cy={y2}
                  r={2.5}
                  fill={edgeStroke}
                  style={{ transition: "fill 0.2s" }}
                />
              </g>
            );
          })}

          {/* Nodes */}
          {flat.nodes.map((node) => {
            const hue = getHue(node.className);
            const isActive = activeFunctionId === node.fqn;
            const onActivePath = activePath.has(node.fqn);
            const isHovered = hoveredFunctionId === node.fqn;
            const isExpanded = expanded.has(node.fqn);
            const hasChildren = node.childCount > 0;
            const nx = node.x + padding;
            const ny = node.y + padding;
            const prStyle = node.prChange
              ? PR_CHANGE_COLORS[node.prChange]
              : null;
            const ifaceStyle = node.kind ? INTERFACE_STYLES[node.kind] : null;

            // Text space available (accounting for seq badge + expand button)
            const textStart = node.seq > 0 ? 22 : 10;
            const textEnd = hasChildren ? NODE_W - 28 : NODE_W - 8;
            const textSpace = textEnd - textStart;

            return (
              <g
                key={node.fqn}
                data-fqn={node.fqn}
                onMouseEnter={() => setHoveredFunctionId(node.fqn)}
                onMouseLeave={() => setHoveredFunctionId(null)}
                onClick={() => {
                  // Set active (never deselect) so the body panel stays
                  // visible while the user expands/collapses the tree.
                  if (!isActive) setActiveFunctionId(node.fqn);
                  // Auto-expand on first open so the children are visible
                  // without a second click. The dedicated +N/− button toggles.
                  if (hasChildren && !isExpanded) toggleExpand(node.fqn);
                }}
                className="cursor-pointer"
                style={{ transition: "opacity 0.2s" }}
              >
                {/* PR glow behind affected nodes */}
                {prStyle && (
                  <rect
                    x={nx - 3}
                    y={ny - 3}
                    width={NODE_W + 6}
                    height={NODE_H + 6}
                    rx={11}
                    fill="none"
                    stroke={prStyle.border}
                    strokeWidth={1.5}
                    opacity={0.4}
                    filter="url(#pr-glow)"
                    className="pointer-events-none"
                  />
                )}

                {/* Node background — PR > interface > default */}
                <rect
                  x={nx}
                  y={ny}
                  width={NODE_W}
                  height={NODE_H}
                  rx={8}
                  fill={
                    prStyle
                      ? prStyle.bg
                      : ifaceStyle
                        ? "hsla(265, 30%, 10%, 0.94)"
                        : node.isTrivial
                          ? "hsla(220, 15%, 10%, 0.6)"
                          : isActive
                            ? `hsla(${hue}, 45%, 13%, 0.95)`
                            : isHovered
                              ? `hsla(${hue}, 35%, 11%, 0.9)`
                              : "hsla(220, 18%, 9%, 0.92)"
                  }
                  stroke={
                    prStyle
                      ? prStyle.border
                      : ifaceStyle
                        ? ifaceStyle.border
                        : node.isTrivial
                          ? "hsla(210, 10%, 20%, 0.3)"
                          : isActive
                            ? `hsl(${hue}, 50%, 45%)`
                            : isHovered
                              ? `hsla(${hue}, 35%, 38%, 0.6)`
                              : "hsla(210, 14%, 20%, 0.5)"
                  }
                  strokeWidth={prStyle || ifaceStyle ? 1.5 : isActive ? 1.5 : 1}
                  opacity={node.isTrivial && !prStyle && !ifaceStyle ? 0.5 : 1}
                  strokeDasharray={
                    node.prChange === "deleted" ||
                    node.prChange === "disconnected"
                      ? "4 3"
                      : ifaceStyle
                        ? "5 3"
                        : "none"
                  }
                  style={{ transition: "fill 0.15s, stroke 0.15s" }}
                />

                {/* Path + active highlight rings — render on top of
                    prStyle/ifaceStyle so cycling through PR changes lights up
                    the whole journey. Plain strokes (no SVG filter) to stay
                    cheap even when many ancestors are expanded. */}
                {onActivePath && !isActive && (
                  <rect
                    x={nx - 2}
                    y={ny - 2}
                    width={NODE_W + 4}
                    height={NODE_H + 4}
                    rx={10}
                    fill="none"
                    stroke={`hsl(${hue}, 70%, 58%)`}
                    strokeWidth={1.5}
                    opacity={0.6}
                    className="pointer-events-none"
                  />
                )}
                {isActive && (
                  <rect
                    x={nx - 2.5}
                    y={ny - 2.5}
                    width={NODE_W + 5}
                    height={NODE_H + 5}
                    rx={10}
                    fill="none"
                    stroke={`hsl(${hue}, 80%, 68%)`}
                    strokeWidth={2.5}
                    className="pointer-events-none"
                  />
                )}

                {/* PR change marker — small notification-style dot anchored
                    to the top-right CORNER of the node (half above, half
                    inside). Sits clear of the expand/collapse button which
                    lives at the vertical centre of the right edge. Colour
                    is the primary status channel; icon is the non-colour
                    signal for accessibility; <title> gives full hover label. */}
                {prStyle && (
                  <g className="pointer-events-none">
                    <title>{prStyle.label}</title>
                    <circle
                      cx={nx + NODE_W - 4}
                      cy={ny - 1}
                      r={7}
                      fill={prStyle.bg}
                      stroke={prStyle.border}
                      strokeWidth={1.2}
                    />
                    <text
                      x={nx + NODE_W - 4}
                      y={ny + 2.5}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={700}
                      fill={prStyle.text}
                      fontFamily="'JetBrains Mono', monospace"
                    >
                      {prStyle.icon}
                    </text>
                  </g>
                )}

                {/* Interface/abstract marker — same corner-dot treatment */}
                {ifaceStyle && !prStyle && (
                  <g className="pointer-events-none">
                    <title>{ifaceStyle.label}</title>
                    <circle
                      cx={nx + NODE_W - 4}
                      cy={ny - 1}
                      r={7}
                      fill="hsla(265, 30%, 10%, 0.96)"
                      stroke={ifaceStyle.border}
                      strokeWidth={1.2}
                    />
                    <text
                      x={nx + NODE_W - 4}
                      y={ny + 2.5}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={700}
                      fill={ifaceStyle.text}
                      fontFamily="'JetBrains Mono', monospace"
                    >
                      {ifaceStyle.icon}
                    </text>
                  </g>
                )}

                {/* Body length bar */}
                {node.bodyLength > 100 && !node.isTrivial && (
                  <rect
                    x={nx + 2}
                    y={ny + NODE_H - 4}
                    rx={1}
                    width={Math.min(NODE_W - 4, node.bodyLength / 40)}
                    height={2}
                    fill={
                      node.bodyLength > 2000
                        ? "hsl(0, 55%, 48%)"
                        : node.bodyLength > 500
                          ? "hsl(35, 65%, 50%)"
                          : `hsl(${hue}, 45%, 42%)`
                    }
                    opacity={0.5}
                  />
                )}

                {/* Sequence badge — bumped contrast so the step number is
                    readable at a glance instead of dissolving into the node. */}
                {node.seq > 0 && (
                  <g>
                    <circle
                      cx={nx + 4}
                      cy={ny + 4}
                      r={9}
                      fill={
                        node.isTrivial
                          ? "hsla(210, 15%, 22%, 0.95)"
                          : `hsla(${hue}, 50%, 26%, 0.98)`
                      }
                      stroke={
                        node.isTrivial
                          ? "hsla(210, 12%, 42%, 0.85)"
                          : `hsla(${hue}, 45%, 58%, 0.85)`
                      }
                      strokeWidth={1}
                    />
                    <text
                      x={nx + 4}
                      y={ny + 7.5}
                      textAnchor="middle"
                      fontSize={9}
                      fontWeight={700}
                      fill={
                        node.isTrivial
                          ? "hsl(210, 14%, 78%)"
                          : `hsl(${hue}, 60%, 88%)`
                      }
                      fontFamily="'JetBrains Mono', monospace"
                    >
                      {node.seq}
                    </text>
                  </g>
                )}

                {/* Class name — truncated to fit */}
                <text
                  x={nx + textStart}
                  y={ny + 18}
                  fontSize={9}
                  fill={
                    node.isTrivial
                      ? "hsl(210, 14%, 45%)"
                      : isActive
                        ? `hsl(${hue}, 45%, 72%)`
                        : isHovered
                          ? `hsl(${hue}, 40%, 68%)`
                          : `hsl(${hue}, 35%, 65%)`
                  }
                  fontFamily="'JetBrains Mono', monospace"
                  style={{ transition: "fill 0.15s" }}
                >
                  {truncate(node.className, textSpace, 9)}
                </text>

                {/* Method name — truncated to fit, bolder */}
                <text
                  x={nx + textStart}
                  y={ny + 34}
                  fontSize={11}
                  fontWeight={node.isTrivial ? 400 : 600}
                  fill={
                    prStyle
                      ? prStyle.text
                      : ifaceStyle
                        ? ifaceStyle.text
                        : node.isTrivial
                          ? "hsl(210, 16%, 55%)"
                          : isActive
                            ? `hsl(${hue}, 55%, 72%)`
                            : "hsl(210, 18%, 72%)"
                  }
                  fontFamily="'JetBrains Mono', monospace"
                  style={{ transition: "fill 0.15s" }}
                >
                  {truncate(node.name, textSpace, 11)}
                </text>

                {/* Expand/collapse indicator — own hit target so it doesn't
                    fight with the body-open click on the rest of the node. */}
                {hasChildren && (
                  <g
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(node.fqn);
                    }}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={nx + NODE_W - 14}
                      cy={ny + NODE_H / 2}
                      r={10}
                      fill="transparent"
                    />
                    <circle
                      cx={nx + NODE_W - 14}
                      cy={ny + NODE_H / 2}
                      r={9}
                      fill={
                        isExpanded
                          ? `hsla(${hue}, 35%, 18%, 0.8)`
                          : `hsla(${hue}, 45%, 22%, 0.6)`
                      }
                      stroke={`hsla(${hue}, 35%, 38%, 0.4)`}
                      strokeWidth={0.5}
                      pointerEvents="none"
                    />
                    <text
                      x={nx + NODE_W - 14}
                      y={ny + NODE_H / 2 + 3.5}
                      textAnchor="middle"
                      fontSize={9}
                      fontWeight={700}
                      fill={`hsl(${hue}, 45%, 68%)`}
                      fontFamily="'JetBrains Mono', monospace"
                      pointerEvents="none"
                    >
                      {isExpanded ? "\u2212" : `+${node.childCount}`}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export default CallFlowChart;

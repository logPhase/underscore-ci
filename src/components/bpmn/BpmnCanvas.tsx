import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ChevronRight, Eye, EyeOff, Maximize2, Minimize2, Minus, MousePointer2, Plus, RotateCcw } from "lucide-react";
import type { BpmnElement, BpmnJourney } from "./types";
import type { Doc, Fact, KnowledgeSummary } from "@/types/intent";
import type { StepKnowledge } from "@/lib/transform-data/journey-knowledge";
import { layoutGraph } from "./layout";
import { BpmnNode } from "./BpmnNode";
import { BpmnEdge } from "./BpmnEdge";
import { exportBpmnSvgAsPng, type ExportOptions } from "@/lib/exportBpmnPng";

export interface BpmnCanvasHandle {
  /** Export the current diagram as a PNG download. Filename should end
   *  with `.png`. Throws if the canvas has no content yet.
   *  `titleBlock` populates the engineering-drawing-style title block
   *  in the bottom-right corner of the PNG — pass PR metadata so the
   *  exported file stands alone as an artifact. */
  exportPng: (filename: string, titleBlock?: ExportOptions['titleBlock']) => Promise<void>;
}

interface Props {
  journey: BpmnJourney;
  onChange?: (next: BpmnJourney) => void;
  /** Look up a method's source body by FQN. Currently unused after the
   *  properties panel was removed; kept on the prop signature so callers
   *  can keep wiring it without churn if the panel comes back. */
  getSource?: (fqn: string) => string | undefined;
  /** Notified whenever the user selects/deselects an element. Used by
   *  the parent (e.g. BpmnEditor) to anchor refinement requests on the
   *  picked node. Receives the selected element's id, or null. */
  onSelectionChange?: (elementId: string | null) => void;
  /** Per-element PR-change status, computed deterministically by the
   *  parent (intersection of element.code_fqns with the PR diff
   *  snapshot set). Drives node decorations (left border + corner
   *  badge). Elements not in the map render normally. */
  elementPrStatus?: Map<string, 'added' | 'modified' | 'deleted'>;
  /** Per-element journey knowledge (from knowledgeByElement) — the Confluence
   *  passages + graph facts surfaced for each step. Drives the 📚 knowledge
   *  marker and the side panel. */
  elementKnowledge?: Map<string, StepKnowledge>;
  /** When set, the floating toolbar grows an exit-fullscreen button at its
   *  right end (after a divider). Passed only when the canvas is mounted
   *  fullscreen, so the ONE control cluster in the top-right corner also
   *  owns the exit affordance — no separate floating button stacking in the
   *  same corner and occluding it. */
  onExitFullscreen?: () => void;
}

type Selection =
  | { kind: "node"; id: string }
  | { kind: "edge"; from: string; to: string }
  | null;

interface ViewState {
  x: number;
  y: number;
  k: number;
}

const MIN_K = 0.25;
const MAX_K = 2.5;

/** True when `cite` looks like an http(s) URL — rendered as a link;
 *  otherwise it's a `:Knowledge` id, rendered as plain text. */
function isUrl(cite: string): boolean {
  return /^https?:\/\//i.test(cite.trim());
}

/** ISO timestamp → a short human date ("Jun 19, 2026"); falls back to the
 *  date part if unparseable, null when absent. */
function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** A short, friendly label for a cite — "Confluence" for Atlassian wiki URLs,
 *  the host for other URLs, the file/page name for paths and :Knowledge ids. */
function citeLabel(cite: string): string {
  const c = (cite || "").trim();
  if (/atlassian\.net/i.test(c)) return "Confluence";
  if (isUrl(c)) {
    try {
      return new URL(c).hostname.replace(/^www\./, "");
    } catch {
      return "Open link";
    }
  }
  return c.split("/").pop() || c;
}

/** Snippets arrive as passages joined by " · ". Split into clean lines so the
 *  panel renders them as a readable list instead of one wall of text. */
function splitSnippet(snippet: string): string[] {
  return (snippet || "")
    .split(/\s*·\s*/)
    .map((p) => p.replace(/^[-•\s]+/, "").trim())
    .filter(Boolean);
}

/** Anchored journey-knowledge side panel — the docs + decisions surfaced for
 *  the clicked step. Shows Confluence passages (Docs) and graph facts
 *  (Decisions), anchored beside the step with click-away / Esc dismiss. */
function KnowledgePanel({
  left,
  top,
  knowledge,
  docs,
  facts,
  onClose,
}: {
  left: number;
  top: number;
  knowledge?: KnowledgeSummary | null;
  docs: Doc[];
  facts: Fact[];
  onClose: () => void;
}) {
  const summary = knowledge?.summary?.trim();
  // Strongest doc first. With no analyzer summary, the top doc carries the
  // headline (title + a short snippet) and the rest are Sources; with a
  // summary, every doc is just a Source link.
  const sortedDocs = [...docs].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const leadDoc = !summary && sortedDocs.length ? sortedDocs[0] : null;
  const sourceDocs = leadDoc ? sortedDocs.slice(1) : sortedDocs;
  const hasLead = !!summary || !!leadDoc;
  return (
    <div
      className="absolute z-30 flex flex-col rounded-lg border shadow-xl"
      style={{
        left,
        top,
        width: 420,
        maxHeight: "75%",
        background: "var(--bpmn-surface)",
        borderColor: "var(--bpmn-cyan)",
        color: "var(--bpmn-text)",
        fontFamily: "var(--bpmn-font-mono)",
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{ borderColor: "var(--bpmn-border)" }}
      >
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--bpmn-cyan)" }}
        >
          📚 Journey knowledge
        </span>
        <button
          onClick={onClose}
          className="rounded px-1 text-zinc-400 hover:text-zinc-100"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="overflow-auto px-3 py-3 text-[11.5px] leading-relaxed">
        {/* Summary — the analyzer's synthesized prose for this step (the
            headline). Falls back to the top doc (title + short snippet) when
            absent, so the step never blanks. */}
        {summary ? (
          <p className="m-0 leading-relaxed" style={{ color: "var(--bpmn-text)" }}>
            {summary}
          </p>
        ) : leadDoc ? (
          <div>
            <div className="mb-1 font-semibold leading-snug" style={{ color: "var(--bpmn-text)" }}>
              {leadDoc.title}
            </div>
            <p className="m-0 leading-snug" style={{ color: "var(--bpmn-text-muted)" }}>
              {splitSnippet(leadDoc.snippet)[0] ?? leadDoc.snippet}
            </p>
          </div>
        ) : null}

        {/* Decisions — graph facts; superseded struck. */}
        {facts.length > 0 && (
          <div
            className={hasLead ? "mt-3 border-t pt-3" : ""}
            style={hasLead ? { borderColor: "var(--bpmn-border)" } : undefined}
          >
            <div
              className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--bpmn-text-muted)" }}
            >
              Decisions
            </div>
            {facts.map((f, i) => {
              const superseded = !!f.invalid_at;
              return (
                <div
                  key={i}
                  className="mt-2 rounded-md border px-2.5 py-2 first:mt-0"
                  style={{
                    borderColor: "var(--bpmn-border)",
                    background: superseded
                      ? "transparent"
                      : "color-mix(in srgb, var(--bpmn-mint) 5%, transparent)",
                  }}
                >
                  <p
                    className="mb-1 leading-snug"
                    style={{
                      color: superseded ? "var(--bpmn-text-muted)" : "var(--bpmn-text)",
                      textDecoration: superseded ? "line-through" : undefined,
                    }}
                  >
                    {f.fact}
                  </p>
                  <div
                    className="flex flex-wrap items-center gap-1.5 text-[9px]"
                    style={{ color: "var(--bpmn-text-dim)" }}
                  >
                    {fmtDate(f.valid_at) && <span>✓ valid {fmtDate(f.valid_at)}</span>}
                    {superseded && (
                      <span
                        className="inline-block rounded px-1 py-0.5 uppercase tracking-wider"
                        style={{
                          background: "color-mix(in srgb, var(--bpmn-rose) 18%, transparent)",
                          color: "var(--bpmn-rose)",
                        }}
                      >
                        superseded{fmtDate(f.invalid_at) ? ` ${fmtDate(f.invalid_at)}` : ""}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Sources — raw docs as title → cite links. The summary already
            distilled the snippets, so they are not shown here. */}
        {sourceDocs.length > 0 && (
          <div
            className={hasLead || facts.length > 0 ? "mt-3 border-t pt-3" : ""}
            style={
              hasLead || facts.length > 0
                ? { borderColor: "var(--bpmn-border)" }
                : undefined
            }
          >
            <div
              className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--bpmn-text-muted)" }}
            >
              <span>Sources</span>
              <span style={{ color: "var(--bpmn-text-dim)" }}>· {sourceDocs.length}</span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {sourceDocs.map((d, i) => (
                <li key={i} className="leading-snug">
                  {d.cite && isUrl(d.cite) ? (
                    <a
                      href={d.cite}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-start gap-1 hover:underline"
                      style={{ color: "var(--bpmn-cyan)" }}
                    >
                      <span>{d.title}</span>
                      <span aria-hidden>↗</span>
                    </a>
                  ) : (
                    <span
                      className="inline-flex items-start gap-1"
                      style={{ color: "var(--bpmn-text-muted)" }}
                    >
                      <span aria-hidden>📄</span>
                      <span>{d.title}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!summary && sortedDocs.length === 0 && facts.length === 0 && (
          <div style={{ color: "var(--bpmn-text-muted)" }}>No knowledge captured for this step.</div>
        )}
      </div>
    </div>
  );
}

export const BpmnCanvas = forwardRef<BpmnCanvasHandle, Props>(function BpmnCanvas(
  { journey: initial, onChange, getSource: _getSource, onSelectionChange, elementPrStatus, elementKnowledge, onExitFullscreen },
  ref,
) {
  const [journey, setJourney] = useState(initial);
  const [selection, setSelection] = useState<Selection>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, k: 1 });
  const [editingId, setEditingId] = useState<string | null>(null);
  // Node id whose journey-knowledge panel is open (click the 📚 marker).
  const [knowledgeNodeId, setKnowledgeNodeId] = useState<string | null>(null);
  // Per-node manual position overrides. Keyed by element id; absent means
  // "use the auto-layout position". Reset by the toolbar Reset button.
  const [posOverrides, setPosOverrides] = useState<Map<string, { x: number; y: number }>>(
    () => new Map(),
  );
  // Per-label manual offset overrides. Labels (gateway "above"
  // questions + edge condition pills) sit at fixed positions relative
  // to their parent element by default, but those positions collide
  // when multiple labels stack at a rank boundary. Users can drag any
  // label to nudge it into clear air; the delta is stored here as an
  // (dx, dy) offset in SVG user space. Reset button clears these.
  // Keys: `node:<id>` for gateway labels, `edge:<from>::<to>` for
  // edge condition pills.
  const [labelOffsets, setLabelOffsets] = useState<Map<string, { dx: number; dy: number }>>(
    () => new Map(),
  );
  const setLabelOffset = useCallback(
    (key: string, dx: number, dy: number) => {
      setLabelOffsets((m) => {
        const next = new Map(m);
        next.set(key, { dx, dy });
        return next;
      });
    },
    [],
  );
  // Progressive-reveal mode — a "study" mode where the diagram is
  // hidden by default and unfolds one element at a time as the user
  // clicks. Based on the testing-effect / prediction-then-feedback
  // cognitive model: the user thinks "what comes next?" before each
  // reveal, which strengthens retention vs. passively scanning the
  // whole diagram. Inactive by default; toggled via the toolbar eye
  // button. `revealIndex` is the count of elements currently visible
  // (1 = only the start event; `revealOrder.length` = everything).
  const [revealMode, setRevealMode] = useState(false);
  const [revealIndex, setRevealIndex] = useState(1);
  // Reset reveal progress whenever reveal mode is toggled on, the
  // journey changes, or the layout topology shifts. Without this,
  // toggling reveal on a second journey would start mid-way through.
  useEffect(() => {
    if (revealMode) setRevealIndex(1);
  }, [revealMode, journey.journey_id]);
  // Active drag state — null when not dragging.
  const [drag, setDrag] = useState<
    { id: string; pointerId: number; startNode: { x: number; y: number }; startPointer: { x: number; y: number } }
    | null
  >(null);
  // Whether the current drag has crossed the click-vs-drag threshold.
  const dragMovedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Always-current camera. softPanToNode and the resize handler MUST read
  // through this ref: they're memoised with empty deps, so reading `view`
  // directly would capture the first-render camera ({0,0,1}) forever and
  // every pan computed at zoom ≠ 100% would land in the wrong place.
  const viewRef = useRef(view);
  viewRef.current = view;
  // True once the user has interacted with the canvas in ANY way — wheel/
  // pinch zoom, canvas pan, zoom buttons, node selection, node drag. While
  // false we're in "auto-fit mode": container resizes re-fit the diagram
  // (initial mount sizing). Once true, resizes PRESERVE the camera exactly.
  // The killer case: clicking a node opens the docked code panel, which
  // shrinks the canvas, which fires the ResizeObserver — re-fitting there
  // yanked the diagram out from under the user's click ("position is gone").
  // Selection must NEVER move the map. Fit (F / toolbar), Reset, and
  // journey changes re-arm auto-fit.
  const userNavRef = useRef(false);

  useImperativeHandle(
    ref,
    () => ({
      exportPng: async (filename, titleBlock) => {
        const svg = svgRef.current;
        if (!svg) throw new Error('BPMN canvas not mounted');
        // Always populate the title block with at least the journey
        // title (taken from the current diagram) — callers can override
        // by passing a fuller object. This guarantees every export is
        // self-identifying.
        const merged: ExportOptions['titleBlock'] = {
          journeyTitle: journey.title,
          ...(titleBlock ?? {}),
        };
        await exportBpmnSvgAsPng(svg, { filename, titleBlock: merged });
      },
    }),
    [journey.title],
  );

  // Sync local state when the parent swaps the diagram (e.g. after a
  // refinement request). Without this, the canvas keeps showing the
  // original diagram even though the parent passes a new one — the
  // initial useState(initial) above only captures on mount. We also
  // reset drag overrides and selection because element ids may have
  // changed across the refinement.
  useEffect(() => {
    setJourney(initial);
    setPosOverrides(new Map());
    setLabelOffsets(new Map());
    setSelection(null);
  }, [initial]);

  // Surface selection changes to the parent (e.g. BpmnEditor uses it
  // to anchor refinement requests on the clicked node).
  useEffect(() => {
    if (!onSelectionChange) return;
    const id =
      selection?.kind === "node" ? selection.id : null;
    onSelectionChange(id);
  }, [selection, onSelectionChange]);

  // Smooth pan / zoom to a selected node — the "seamless focus" gesture.
  // When the user clicks a node, the canvas glides it to the centre of
  // the viewport over ~350 ms using ease-out-quart. If the user is
  // currently fit-to-screen at low zoom, we also lift the zoom to 1.0 so
  // the focused node is readable; if they're already zoomed in, we keep
  // their zoom level (their navigation intent wins).
  // Pan only — never zooms back out. A pending animation is cancelled
  // when a new selection arrives, so rapid clicks feel responsive
  // instead of queued.
  const panAnimRef = useRef<number | null>(null);

  // Soft pan — only nudge the camera enough to put `(nodeX, nodeY)` inside the
  // central 80% safe band, never to dead centre. If the node is already
  // comfortably in view, do nothing. This matches the "if it's on screen, let
  // me drag — don't yank the whole map" feedback from clicking BPMN tasks.
  const softPanToNode = useCallback(
    (nodeX: number, nodeY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const cw = svg.clientWidth;
      const ch = svg.clientHeight;
      if (cw <= 0 || ch <= 0) return;
      // Read the CURRENT camera through the ref — this callback is memoised
      // with [] so reading `view` directly would see the first-render
      // camera and mis-pan at any other zoom level.
      const v0 = viewRef.current;
      const sx = nodeX * v0.k + v0.x;
      const sy = nodeY * v0.k + v0.y;
      const marginX = cw * 0.1;
      const marginY = ch * 0.1;
      const outsideX = sx < marginX || sx > cw - marginX;
      const outsideY = sy < marginY || sy > ch - marginY;
      if (!outsideX && !outsideY) return; // already in view → no pan, no jerk
      let targetX = v0.x;
      let targetY = v0.y;
      if (sx < marginX)            targetX = v0.x + (marginX - sx);
      else if (sx > cw - marginX)  targetX = v0.x + ((cw - marginX) - sx);
      if (sy < marginY)            targetY = v0.y + (marginY - sy);
      else if (sy > ch - marginY)  targetY = v0.y + ((ch - marginY) - sy);
      const startX = v0.x;
      const startY = v0.y;
      const duration = 380;
      const t0 = performance.now();
      const ease = (t: number) => 1 - Math.pow(1 - t, 4);
      if (panAnimRef.current != null) cancelAnimationFrame(panAnimRef.current);
      const step = (now: number) => {
        const elapsed = now - t0;
        const t = Math.min(1, elapsed / duration);
        const e = ease(t);
        setView((v) => ({
          ...v,
          x: startX + (targetX - startX) * e,
          y: startY + (targetY - startY) * e,
        }));
        if (t < 1) panAnimRef.current = requestAnimationFrame(step);
        else panAnimRef.current = null;
      };
      panAnimRef.current = requestAnimationFrame(step);
    },
    // Stable callback; current camera comes from viewRef (see above).
    [],
  );

  // Selection does NOT move the camera. History: v1 centred the node on
  // every click (map jumped constantly); v2 "soft-panned" only when the
  // node was outside the central 80% band — but every selection today
  // originates from a direct click, meaning the node is demonstrably on
  // screen, and even the minimal nudge read as "the position is gone".
  // The camera belongs to the user; softPanToNode remains available for
  // future *programmatic* selection sync (e.g. call-graph → BPMN).

  const baseLayout = useMemo(
    () => layoutGraph(journey.elements, journey.flows),
    [journey.elements, journey.flows],
  );

  // Apply manual overrides on top of the auto-layout. Edges re-route from
  // the overridden node positions automatically because they're recomputed
  // here from the merged node list.
  const layout = useMemo(() => {
    if (posOverrides.size === 0) return baseLayout;
    const nodes = baseLayout.nodes.map((n) =>
      posOverrides.has(n.id) ? { ...n, ...posOverrides.get(n.id)! } : n,
    );
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const edges = baseLayout.edges.map((e) => {
      const a = nodeById.get(e.from);
      const b = nodeById.get(e.to);
      if (!a || !b) return e;
      // Re-route with the same elbow shape used at first layout
      const ax = a.x + a.w / 2;
      const ay = a.y;
      const bx = b.x - b.w / 2;
      const by = b.y;
      if (Math.abs(ay - by) < 1) return { ...e, points: [{ x: ax, y: ay }, { x: bx, y: by }] };
      const midX = ax + Math.max(20, (bx - ax) / 2);
      return {
        ...e,
        points: [
          { x: ax, y: ay },
          { x: midX, y: ay },
          { x: midX, y: by },
          { x: bx, y: by },
        ],
      };
    });
    return { ...baseLayout, nodes, edges };
  }, [baseLayout, posOverrides]);

  // "Track a line" — the through-path of the focused node. Focus is the
  // hovered node, else the selected node. An edge (u→v) is on the through-
  // path when it lies on some flow PASSING THROUGH the focus F: either its
  // target can still reach F (upstream leg: v ∈ ancestors∪{F}) or its source
  // is reachable from F (downstream leg: u ∈ descendants∪{F}). Reachability
  // is transitive in both directions; the graphs are tiny (≤~15 nodes) so
  // full traversal is cheap. Null focus → no highlight (all edges ambient).
  const flowFocusId = hoverNode ?? (selection?.kind === "node" ? selection.id : null);
  const throughPath = useMemo(() => {
    if (!flowFocusId) return null;
    const out = new Map<string, string[]>();
    const inc = new Map<string, string[]>();
    const push = (m: Map<string, string[]>, k: string, v: string) => {
      const a = m.get(k);
      if (a) a.push(v);
      else m.set(k, [v]);
    };
    for (const e of layout.edges) {
      push(out, e.from, e.to);
      push(inc, e.to, e.from);
    }
    const reach = (adj: Map<string, string[]>) => {
      const seen = new Set<string>();
      const stack = [flowFocusId];
      while (stack.length) {
        const n = stack.pop()!;
        for (const m of adj.get(n) ?? []) {
          if (!seen.has(m)) {
            seen.add(m);
            stack.push(m);
          }
        }
      }
      return seen;
    };
    return { ancestors: reach(inc), descendants: reach(out) };
  }, [flowFocusId, layout.edges]);

  // Progressive-reveal order: nodes sorted topologically by their dagre
  // x position (LR rankdir → x ≈ rank ≈ time-in-flow), then by y, then
  // id for stability. Start events lead, end events trail. Edges are
  // implicit — an edge is "revealed" the moment both endpoints are.
  const revealOrder = useMemo(
    () =>
      [...layout.nodes]
        .sort((a, b) => a.x - b.x || a.y - b.y || a.id.localeCompare(b.id))
        .map((n) => n.id),
    [layout.nodes],
  );
  const revealedIds = useMemo(() => {
    if (!revealMode) return null; // null = "render everything"
    return new Set(revealOrder.slice(0, Math.min(revealIndex, revealOrder.length)));
  }, [revealMode, revealOrder, revealIndex]);
  const allRevealed = revealMode && revealIndex >= revealOrder.length;

  // Reveal mode v5 — camera-soft, spotlight-on-newest.
  // History: v1 full pan (jerky); v2 no camera + 6% ghosts (user
  // "didn't see it"); v3 22% ghosts + drop-shadow spotlight (filter
  // didn't render reliably on SVG g); v4 SVG underlay shape (works
  // but element was off-screen so still invisible). v5 keeps the
  // underlay pulse AND adds a *minimal* soft pan: if the new node
  // is already comfortably inside the viewport (within the central
  // 80%), the camera stays put. If it's outside that band, we pan
  // just enough to put it back inside, never to dead centre. Matches
  // the "doesn't move so much" intent — most clicks zero camera
  // movement, edge cases get a small nudge.
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  useEffect(() => {
    if (!revealMode) {
      setSpotlightId(null);
      return;
    }
    const newestId = revealOrder[revealIndex - 1];
    if (!newestId) return;
    setSpotlightId(newestId);

    // Check visibility and soft-pan only if outside the safe band.
    const svg = svgRef.current;
    const node = layout.nodes.find((n) => n.id === newestId);
    if (svg && node) {
      const cw = svg.clientWidth;
      const ch = svg.clientHeight;
      // Screen-space position of the node's centre.
      const sx = node.x * view.k + view.x;
      const sy = node.y * view.k + view.y;
      // Safe band: central 80% of viewport (10% margin each side).
      const marginX = cw * 0.1;
      const marginY = ch * 0.1;
      const outsideX = sx < marginX || sx > cw - marginX;
      const outsideY = sy < marginY || sy > ch - marginY;
      if (outsideX || outsideY) {
        // Soft pan — only the minimum delta to bring the node back
        // into the safe band, not full centring.
        let targetX = view.x;
        let targetY = view.y;
        if (sx < marginX)        targetX = view.x + (marginX - sx);
        else if (sx > cw - marginX) targetX = view.x + ((cw - marginX) - sx);
        if (sy < marginY)        targetY = view.y + (marginY - sy);
        else if (sy > ch - marginY) targetY = view.y + ((ch - marginY) - sy);
        // Animate the same way panToNode does — but to the soft target
        // (k unchanged), not the centred target.
        const startX = view.x;
        const startY = view.y;
        const duration = 380;
        const t0 = performance.now();
        const ease = (t: number) => 1 - Math.pow(1 - t, 4);
        if (panAnimRef.current != null) cancelAnimationFrame(panAnimRef.current);
        const step = (now: number) => {
          const elapsed = now - t0;
          const t = Math.min(1, elapsed / duration);
          const e = ease(t);
          setView((v) => ({
            ...v,
            x: startX + (targetX - startX) * e,
            y: startY + (targetY - startY) * e,
          }));
          if (t < 1) panAnimRef.current = requestAnimationFrame(step);
          else panAnimRef.current = null;
        };
        panAnimRef.current = requestAnimationFrame(step);
      }
    }

    const tt = setTimeout(() => setSpotlightId(null), 2300);
    return () => {
      clearTimeout(tt);
      if (panAnimRef.current != null) cancelAnimationFrame(panAnimRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealMode, revealIndex, revealOrder]);

  // Click-to-advance handler. The floating "Reveal next" button calls
  // this; the SVG background also calls it when reveal mode is on, so
  // the user can advance without aiming at the button.
  const advanceReveal = useCallback(() => {
    setRevealIndex((i) => Math.min(i + 1, revealOrder.length));
  }, [revealOrder.length]);

  const update = useCallback(
    (next: BpmnJourney) => {
      setJourney(next);
      onChange?.(next);
    },
    [onChange],
  );

  const onChangeElement = useCallback(
    (id: string, patch: Partial<BpmnElement>) => {
      update({
        ...journey,
        elements: journey.elements.map((e) =>
          e.id === id ? { ...e, ...patch } : e,
        ),
      });
    },
    [journey, update],
  );

  // `fitToScreen` runs against the CURRENT layout (including manual drag
  // overrides). The toolbar Fit button uses this directly — re-fits to
  // wherever the user has dragged things.
  // Returns true when it actually fit (container measured + nodes present),
  // false when it bailed on a 0×0 container. The initial-fit retry loop
  // (mount effect below) keys off this — a 0×0 first paint must not count
  // as "fitted", or the camera stays at identity and the diagram renders
  // as a cramped top-left slice.
  const fitToScreen = useCallback((): boolean => {
    const svg = svgRef.current;
    if (!svg || layout.nodes.length === 0) return false;
    const cw = svg.clientWidth;
    const ch = svg.clientHeight;
    if (cw <= 0 || ch <= 0) return false;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of layout.nodes) {
      // Gateway + event captions now sit BELOW the shape (up to ~3 lines),
      // and nothing sits above any node, so the box reserves a little at the
      // top and a generous band below for those captions.
      minX = Math.min(minX, n.x - n.w / 2);
      minY = Math.min(minY, n.y - n.h / 2 - 12);
      maxX = Math.max(maxX, n.x + n.w / 2);
      maxY = Math.max(maxY, n.y + n.h / 2 + 52);
    }
    const bw = maxX - minX;
    const bh = maxY - minY;
    const padTop = 48; // toolbar floats top-right now — no full-width bar
    const padBottom = 40;
    const padX = 40;
    // Fit-to-screen scale. We prefer label readability (≥0.7), but
    // when the diagram is too wide to fit at 0.7 in the available
    // canvas, prioritising readability hides half the diagram off-
    // screen — strictly worse than a smaller-but-visible view. So:
    //   - normal case: clamp to [0.7, 2] (good label legibility)
    //   - fallback:    if the diagram needs <0.7 to fit, accept down to 0.35
    // 0.35 keeps the structure recognisable; users can zoom in to read
    // specifics. Earlier hard floor of 0.7 left wide diagrams clipped.
    // Cap the auto-fit at 1.0 — small diagrams used to balloon to 2×,
    // which read as cartoonish and left users to zoom back out. 1.0 is
    // the layout's native, most readable scale; users can still zoom in.
    const fit = Math.min((cw - padX * 2) / bw, (ch - padTop - padBottom) / bh);
    const k = Math.min(1, Math.max(0.35, fit));
    const x = (cw - bw * k) / 2 - minX * k;
    // Place the diagram slightly ABOVE centre (42% of the free vertical
    // space above, 58% below). Wide/linear flows fit width-first and leave a
    // tall void; centring makes the flow look like it's floating in the
    // middle of nowhere. Tucking it up under the header reads as intentional
    // — flow on top, breathing room below — while balanced diagrams (little
    // free space) are unaffected.
    const freeV = ch - padTop - padBottom - bh * k;
    const y = padTop + freeV * 0.42 - minY * k;
    setView({ x, y, k });
    // Fitted = back in auto mode; subsequent container resizes may re-fit
    // until the user takes the camera again.
    userNavRef.current = false;
    return true;
  }, [layout.nodes]);

  // Auto-fit only on (a) the FIRST mount and (b) journey id changes.
  // Critically, do NOT depend on `fitToScreen` (which depends on layout
  // and so changes on every drag) — that would re-snap the viewport
  // every time the user moves a node, which feels like "drag zooms out".
  // Use a ref to call the always-current fit function.
  const fitRef = useRef(fitToScreen);
  fitRef.current = fitToScreen;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    userNavRef.current = false; // new journey → re-arm auto-fit

    // Robust initial fit. The canvas frequently measures 0×0 on first
    // paint (the flex / min-h-0 / resizable chain hasn't settled), and a
    // fit against a 0×0 container bails — which used to leave the camera
    // at identity (k=1): a cramped top-left slice with 260px labels
    // overlapping neighbours ("everything looks collapsed"). Retry across
    // animation frames until the FIRST successful fit, however many frames
    // that takes, capped at ~5s so a permanently-hidden canvas can't spin.
    let firstFitDone = false;
    let rafId: number | null = null;
    const startedAt = performance.now();
    const tryInitialFit = () => {
      if (firstFitDone) return;
      if (fitRef.current()) {
        firstFitDone = true;
        return;
      }
      if (performance.now() - startedAt < 5000) {
        rafId = requestAnimationFrame(tryInitialFit);
      }
    };
    rafId = requestAnimationFrame(tryInitialFit);

    // Container resizes serve two roles:
    //   - before the first fit: a resize is often the moment the container
    //     finally gains a real size — take the fit the instant it does.
    //   - after the first fit (code panel docking, rail drag, window
    //     resize): re-fit ONLY while the user hasn't touched the camera.
    //     After any interaction the camera is theirs — a resize must not
    //     move it.
    const ro = new ResizeObserver(() => {
      if (!firstFitDone) {
        if (fitRef.current()) firstFitDone = true;
      } else if (!userNavRef.current) {
        fitRef.current();
      }
    });
    ro.observe(svg);
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [journey.journey_id]); // ← fit on journey change only, NOT on every drag

  const panRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(
    null,
  );
  const onBgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.target !== e.currentTarget) return;
    userNavRef.current = true; // canvas pan — camera is the user's now
    setSelection(null);
    setKnowledgeNodeId(null); // click-away dismisses the knowledge panel
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      ox: view.x,
      oy: view.y,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onBgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    // Node drag takes precedence over canvas pan when active.
    if (drag) {
      // Ignore sub-threshold jitter: a plain click must select WITHOUT
      // nudging the node onto the 8px grid (the old behaviour produced a
      // tiny position jump on every click — "selecting moves things").
      if (
        !dragMovedRef.current &&
        Math.hypot(e.clientX - drag.startPointer.x, e.clientY - drag.startPointer.y) < 4
      ) {
        return;
      }
      dragMovedRef.current = true;
      const dx = (e.clientX - drag.startPointer.x) / view.k;
      const dy = (e.clientY - drag.startPointer.y) / view.k;
      const nx = Math.round((drag.startNode.x + dx) / 8) * 8;
      const ny = Math.round((drag.startNode.y + dy) / 8) * 8;
      setPosOverrides((m) => {
        const next = new Map(m);
        next.set(drag.id, { x: nx, y: ny });
        return next;
      });
      return;
    }
    if (!panRef.current) return;
    setView((v) => ({
      ...v,
      x: panRef.current!.ox + (e.clientX - panRef.current!.startX),
      y: panRef.current!.oy + (e.clientY - panRef.current!.startY),
    }));
  };
  const onBgPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag) {
      try { (e.currentTarget as Element).releasePointerCapture(drag.pointerId); } catch { /* ignore */ }
      setDrag(null);
      return;
    }
    panRef.current = null;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Begin a node drag. Called from each node's onPointerDown (we keep the
  // existing selection behaviour and additionally arm the drag state).
  const beginNodeDrag = useCallback(
    (e: React.PointerEvent, id: string) => {
      // Selection / drag counts as interaction: the docked code panel may
      // open as a consequence and resize the canvas — the camera must not
      // re-fit out from under the click.
      userNavRef.current = true;
      const node = layout.nodes.find((n) => n.id === id);
      if (!node) return;
      // Capture on the SVG so subsequent move/up events flow to onBg* handlers
      const svg = svgRef.current;
      if (svg) {
        try { svg.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      dragMovedRef.current = false;
      setDrag({
        id,
        pointerId: e.pointerId,
        startNode: { x: node.x, y: node.y },
        startPointer: { x: e.clientX, y: e.clientY },
      });
    },
    [layout.nodes],
  );

  const onWheel = useCallback(
    (e: WheelEvent) => {
      if (!svgRef.current) return;
      e.preventDefault();
      userNavRef.current = true; // wheel zoom/pan — camera is the user's now
      // Pinch-zoom on Mac trackpads sets ctrlKey=true. Hold ctrl/cmd + wheel
      // also zooms. Otherwise treat as a two-finger pan (deltaX/deltaY).
      const isZoom = e.ctrlKey || e.metaKey;
      if (isZoom) {
        const rect = svgRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        setView((v) => {
          const factor = Math.exp(-e.deltaY * 0.01);
          const nk = Math.max(MIN_K, Math.min(MAX_K, v.k * factor));
          const ratio = nk / v.k;
          return {
            k: nk,
            x: mx - (mx - v.x) * ratio,
            y: my - (my - v.y) * ratio,
          };
        });
      } else {
        setView((v) => ({
          ...v,
          x: v.x - e.deltaX,
          y: v.y - e.deltaY,
        }));
      }
    },
    [],
  );

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  const zoomBy = (factor: number) => {
    const c = svgRef.current;
    if (!c) return;
    userNavRef.current = true; // toolbar zoom — camera is the user's now
    const rect = c.getBoundingClientRect();
    const mx = rect.width / 2;
    const my = rect.height / 2;
    setView((v) => {
      const nk = Math.max(MIN_K, Math.min(MAX_K, v.k * factor));
      const ratio = nk / v.k;
      return { k: nk, x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio };
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingId) return;
      if (e.key === "Escape") {
        // Escape coordination with the page shell (ChapterView). The shell
        // owns the OUTER stack — step-functions dialog, call-graph popup,
        // fullscreen — via a capture-phase handler that runs before this
        // bubble-phase one. When it peels one of those layers it calls
        // preventDefault(); we then bail so a single Escape doesn't ALSO
        // silently clear the node selection underneath. Selection-clear is
        // ours to own; when nothing outer consumed the key, we do it here.
        if (e.defaultPrevented) return;
        setSelection(null);
        setEditingId(null);
        setKnowledgeNodeId(null);
      }
      if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey) {
        fitToScreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fitToScreen, editingId]);

  return (
    <div
      ref={containerRef}
      className="bpmn-canvas-root flex h-full w-full"
      style={{ background: "var(--bpmn-bg)" }}
    >
      <div className="relative flex-1 overflow-hidden">
        {/* Floating toolbar — top-right, no full-width title bar. The
            journey title already lives in the ChapterView header; the
            old in-canvas duplicate ate ~48px of diagram height. */}
        <div className="absolute right-3 top-3 z-10">
          <Toolbar
            zoom={view.k}
            revealMode={revealMode}
            onToggleReveal={() => setRevealMode((m) => !m)}
            onZoomIn={() => zoomBy(1.2)}
            onZoomOut={() => zoomBy(1 / 1.2)}
            onFit={fitToScreen}
            onReset={() => {
              setView({ x: 0, y: 0, k: 1 });
              // Reset also clears manual node-drag overrides so the
              // diagram snaps back to the auto-layout, and rewinds
              // any in-progress reveal to step 1.
              setPosOverrides(new Map());
              setLabelOffsets(new Map());
              setRevealIndex(1);
            }}
            onExitFullscreen={onExitFullscreen}
          />
        </div>

        <svg
          ref={svgRef}
          className="absolute inset-0 h-full w-full"
          style={{ cursor: panRef.current ? "grabbing" : "default" }}
          onPointerDown={onBgPointerDown}
          onPointerMove={onBgPointerMove}
          onPointerUp={onBgPointerUp}
          onPointerCancel={onBgPointerUp}
        >
          <defs>
            {/* Background — a subtle dot grid on a near-black indigo plate
                (the reference's canvas). The dots are ambient texture: low
                opacity, quiet, they never compete with the cards. The plate
                is deliberately deeper than the surface colour so the cards
                visibly lift off it (high figure/ground contrast). */}
            <pattern
              id="bpmn-dot-grid"
              width={26}
              height={26}
              patternUnits="userSpaceOnUse"
            >
              <circle cx={1} cy={1} r={1} fill="var(--bpmn-border)" opacity={0.55} />
            </pattern>
            <Arrow id="bpmn-arrow-def" color="var(--bpmn-border-em)" />
            <Arrow id="bpmn-arrow-hov" color="var(--bpmn-text-dim)" />
            <Arrow id="bpmn-arrow-sel" color="var(--bpmn-cyan)" />
          </defs>

          <rect
            x={0}
            y={0}
            width="100%"
            height="100%"
            fill="var(--bpmn-canvas)"
            pointerEvents="none"
          />
          <rect
            x={0}
            y={0}
            width="100%"
            height="100%"
            fill="url(#bpmn-dot-grid)"
            pointerEvents="none"
          />

          <g transform={`translate(${view.x}, ${view.y}) scale(${view.k})`}>
            {layout.edges.map((edge, edgeIndex) => {
              // Two flows can share the same from/to and differ only by
              // condition (e.g. a gateway whose branches both converge on
              // the next node). Suffix the stable array index so the React
              // key stays unique.
              const key = `${edge.from}->${edge.to}#${edgeIndex}`;
              const isSel =
                selection?.kind === "edge" &&
                selection.from === edge.from &&
                selection.to === edge.to;
              // Always render the edge — reveal mode just tints the
              // ghost vs. revealed state via className. The transition
              // fires in place, no remount.
              const edgeRevealed =
                !revealedIds ||
                (revealedIds.has(edge.from) && revealedIds.has(edge.to));
              const edgeClass = revealMode
                ? edgeRevealed ? "bpmn-revealed-edge" : "bpmn-ghosted-edge"
                : undefined;
              // On the focused node's through-path? (see throughPath memo)
              const onPath =
                !!throughPath &&
                (edge.to === flowFocusId ||
                  edge.from === flowFocusId ||
                  throughPath.ancestors.has(edge.to) ||
                  throughPath.descendants.has(edge.from));
              return (
                <g key={key} className={edgeClass}>
                  <BpmnEdge
                    edge={edge}
                    selected={isSel}
                    hovered={hoverEdge === key}
                    focusActive={!!throughPath}
                    onPath={onPath}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelection({ kind: "edge", from: edge.from, to: edge.to });
                    }}
                    onPointerEnter={() => setHoverEdge(key)}
                    onPointerLeave={() =>
                      setHoverEdge((h) => (h === key ? null : h))
                    }
                  />
                </g>
              );
            })}

            {layout.nodes.map((node) => {
              const isSel =
                selection?.kind === "node" && selection.id === node.id;
              const nodeRevealed = !revealedIds || revealedIds.has(node.id);
              const isSpotlit = revealMode && spotlightId === node.id;
              const nodeClass = revealMode
                ? `${nodeRevealed ? "bpmn-revealed" : "bpmn-ghosted"}${isSpotlit ? " bpmn-spotlight-active" : ""}`
                : undefined;
              return (
                <g key={node.id} className={nodeClass}>
                  {/* Spotlight underlay — sits BEHIND the actual node
                      and pulses cyan when the parent g has the
                      .bpmn-spotlight-active class. Always rendered;
                      always invisible by default. Shape matches the
                      node's footprint so the halo reads naturally. */}
                  {(() => {
                    const pad = 12;
                    if (
                      node.type === "start-event" ||
                      node.type === "end-event"
                    ) {
                      return (
                        <circle
                          className="bpmn-spotlight-underlay"
                          cx={node.x}
                          cy={node.y}
                          r={node.w / 2 + pad}
                        />
                      );
                    }
                    if (
                      node.type === "exclusive-gateway" ||
                      node.type === "parallel-gateway"
                    ) {
                      const half = node.w / 2 + pad;
                      return (
                        <polygon
                          className="bpmn-spotlight-underlay"
                          points={`${node.x},${node.y - half} ${node.x + half},${node.y} ${node.x},${node.y + half} ${node.x - half},${node.y}`}
                        />
                      );
                    }
                    return (
                      <rect
                        className="bpmn-spotlight-underlay"
                        x={node.x - node.w / 2 - pad}
                        y={node.y - node.h / 2 - pad}
                        width={node.w + pad * 2}
                        height={node.h + pad * 2}
                        rx={14}
                        ry={14}
                      />
                    );
                  })()}
                <BpmnNode
                  node={node}
                  selected={isSel}
                  hovered={hoverNode === node.id}
                  prChange={elementPrStatus?.get(node.id) ?? null}
                  knowledgeCount={(() => {
                    const k = elementKnowledge?.get(node.id);
                    return k ? k.docs.length + k.facts.length : null;
                  })()}
                  onKnowledgeClick={() => setKnowledgeNodeId(node.id)}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelection({ kind: "node", id: node.id });
                    // Arm a drag — pointer move/up land on the SVG and
                    // are routed through the background handlers above.
                    beginNodeDrag(e, node.id);
                  }}
                  onPointerEnter={() => setHoverNode(node.id)}
                  onPointerLeave={() =>
                    setHoverNode((h) => (h === node.id ? null : h))
                  }
                  onDoubleClick={() => setEditingId(node.id)}
                />
                </g>
              );
            })}
          </g>
        </svg>

        {editingId && (
          <InlineEditor
            element={journey.elements.find((e) => e.id === editingId)!}
            view={view}
            layout={layout}
            onCommit={(label) => {
              onChangeElement(editingId, { label });
              setEditingId(null);
            }}
            onCancel={() => setEditingId(null)}
          />
        )}

        {/* Journey-knowledge panel — anchored beside the clicked step's 📚
            marker. Click-away / Esc dismiss. */}
        {(() => {
          if (!knowledgeNodeId) return null;
          const n = layout.nodes.find((nd) => nd.id === knowledgeNodeId);
          const k = elementKnowledge?.get(knowledgeNodeId);
          if (!n || !k || (k.docs.length === 0 && k.facts.length === 0)) return null;
          const W = 420;
          const cw = containerRef.current?.clientWidth ?? 900;
          const ch = containerRef.current?.clientHeight ?? 600;
          const sLeft = (n.x - n.w / 2) * view.k + view.x;
          const sRight = (n.x + n.w / 2) * view.k + view.x;
          const sTop = (n.y - n.h / 2) * view.k + view.y;
          const openLeft = sRight + 14 + W > cw;
          const left = openLeft ? Math.max(8, sLeft - 14 - W) : sRight + 14;
          const top = Math.min(Math.max(8, sTop), Math.max(8, ch - 140));
          return (
            <KnowledgePanel
              key={knowledgeNodeId}
              left={left}
              top={top}
              knowledge={k.knowledge}
              docs={k.docs}
              facts={k.facts}
              onClose={() => setKnowledgeNodeId(null)}
            />
          );
        })()}

        {/* Reveal-mode advance card. Bottom-centre, floats above the
            status bar. Big primary button "Reveal next ▸" plus a small
            step counter. When the user has revealed everything, the
            button becomes a "Show all again" reset. */}
        {revealMode && (
          <div
            className="absolute left-1/2 z-10 flex flex-col items-center gap-2 px-4 py-3"
            style={{
              bottom: 56,
              transform: "translateX(-50%)",
              background: "color-mix(in srgb, var(--bpmn-bg) 85%, transparent)",
              backdropFilter: "blur(10px) saturate(1.05)",
              WebkitBackdropFilter: "blur(10px) saturate(1.05)",
              border: "1px solid var(--bpmn-border-soft)",
              borderRadius: 12,
              boxShadow: "0 14px 40px rgb(0 0 0 / 0.45)",
              fontFamily: "var(--bpmn-font-mono)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: 1.4,
                textTransform: "uppercase",
                color: "var(--bpmn-text-dim)",
                fontWeight: 500,
              }}
            >
              {allRevealed
                ? "all steps revealed"
                : "predict, then reveal"}
            </div>
            {allRevealed ? (
              <button
                onClick={() => setRevealIndex(1)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 16px",
                  background: "transparent",
                  border: "1px solid var(--bpmn-border-em)",
                  borderRadius: 8,
                  color: "var(--bpmn-text)",
                  fontFamily: "var(--bpmn-font-mono)",
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: 0.4,
                  cursor: "pointer",
                  transition: "background 140ms, border-color 140ms",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bpmn-surface-hi)";
                  e.currentTarget.style.borderColor = "var(--bpmn-cyan)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor = "var(--bpmn-border-em)";
                }}
              >
                <RotateCcw size={13} /> Replay from start
              </button>
            ) : (
              <button
                onClick={advanceReveal}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 18px",
                  background: "var(--bpmn-cyan)",
                  border: "none",
                  borderRadius: 8,
                  color: "var(--bpmn-bg)",
                  fontFamily: "var(--bpmn-font-mono)",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  cursor: "pointer",
                  boxShadow:
                    "0 0 0 1px color-mix(in srgb, var(--bpmn-cyan) 60%, transparent), 0 6px 18px color-mix(in srgb, var(--bpmn-cyan) 28%, transparent)",
                  transition: "transform 120ms, box-shadow 140ms",
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = "scale(0.97)";
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                Reveal next <ChevronRight size={14} />
              </button>
            )}
            <div
              style={{
                fontSize: 10,
                color: "var(--bpmn-text-muted)",
                letterSpacing: 0.3,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              step <span style={{ color: "var(--bpmn-text)" }}>{Math.min(revealIndex, revealOrder.length)}</span> of {revealOrder.length}
            </div>
          </div>
        )}

        <div
          className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-5 py-2"
          style={{
            color: "var(--bpmn-text-muted)",
            background: "var(--bpmn-bg-deep)",
            borderTop: "1px solid var(--bpmn-border-soft)",
            fontFamily: "var(--bpmn-font-mono)",
            fontSize: 10,
            letterSpacing: 0.3,
          }}
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <MousePointer2 size={10} /> drag or two-finger swipe to pan · pinch / ⌘+scroll to zoom · F to fit
            </span>
          </div>
          <div className="flex items-center gap-3 tabular-nums">
            <span style={{ color: "var(--bpmn-text)" }}>{journey.elements.length}</span>
            <span style={{ color: "var(--bpmn-text-dim)" }}>elements</span>
            <span style={{ color: "var(--bpmn-text-dim)" }}>·</span>
            <span style={{ color: "var(--bpmn-text)" }}>{journey.flows.length}</span>
            <span style={{ color: "var(--bpmn-text-dim)" }}>flows</span>
          </div>
        </div>
      </div>

    </div>
  );
});

function Arrow({ id, color }: { id: string; color: string }) {
  // markerUnits="userSpaceOnUse" pins the arrowhead to a FIXED size in
  // diagram units — without it the head scales with strokeWidth, and the
  // now-thick (5.5–7px) flow lines would balloon the heads to blobs. 14
  // user units ≈ 6px at the typical auto-fit scale, proportional to the
  // thick wire. refX sits the tip just shy of the node so the round dash
  // caps don't poke through the arrow.
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX={8.5}
      refY={5}
      markerWidth={14}
      markerHeight={14}
      markerUnits="userSpaceOnUse"
      orient="auto-start-reverse"
    >
      <path d="M 0 0.5 L 10 5 L 0 9.5 z" fill={color} />
    </marker>
  );
}

function Toolbar({
  zoom,
  revealMode,
  onToggleReveal,
  onZoomIn,
  onZoomOut,
  onFit,
  onReset,
  onExitFullscreen,
}: {
  zoom: number;
  revealMode: boolean;
  onToggleReveal: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
  /** In fullscreen only — appends an exit button at the toolbar's right
   *  end so the exit affordance lives INSIDE this control cluster instead
   *  of a separate button stacked in the same corner. */
  onExitFullscreen?: () => void;
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-md p-1"
      style={{
        background: "var(--bpmn-surface)",
        border: "1px solid var(--bpmn-border-soft)",
        fontFamily: "var(--bpmn-font-mono)",
      }}
    >
      <ToolBtn
        onClick={onToggleReveal}
        title={revealMode ? "Show full diagram" : "Reveal mode — click to advance step by step"}
        active={revealMode}
      >
        {revealMode ? <EyeOff size={13} /> : <Eye size={13} />}
      </ToolBtn>
      <div
        style={{
          width: 1,
          height: 14,
          background: "var(--bpmn-border-soft)",
          margin: "0 3px",
        }}
      />
      <ToolBtn onClick={onZoomOut} title="Zoom out">
        <Minus size={13} />
      </ToolBtn>
      <div
        className="px-2 text-[10.5px] tabular-nums"
        style={{
          color: "var(--bpmn-text-muted)",
          minWidth: 48,
          textAlign: "center",
          letterSpacing: 0.4,
        }}
      >
        {Math.round(zoom * 100)}%
      </div>
      <ToolBtn onClick={onZoomIn} title="Zoom in">
        <Plus size={13} />
      </ToolBtn>
      <div
        style={{
          width: 1,
          height: 14,
          background: "var(--bpmn-border-soft)",
          margin: "0 3px",
        }}
      />
      <ToolBtn onClick={onFit} title="Fit to screen (F)">
        <Maximize2 size={12} />
      </ToolBtn>
      <ToolBtn onClick={onReset} title="Reset view">
        <RotateCcw size={12} />
      </ToolBtn>
      {onExitFullscreen && (
        <>
          <div
            style={{
              width: 1,
              height: 14,
              background: "var(--bpmn-border-soft)",
              margin: "0 3px",
            }}
          />
          <ToolBtn onClick={onExitFullscreen} title="Exit fullscreen (Esc)">
            <Minimize2 size={12} />
          </ToolBtn>
        </>
      )}
    </div>
  );
}

function ToolBtn({
  onClick,
  title,
  active,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded transition-colors"
      style={{
        color: active ? "var(--bpmn-cyan)" : "var(--bpmn-text-muted)",
        background: active ? "color-mix(in srgb, var(--bpmn-cyan) 14%, transparent)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (active) return;
        e.currentTarget.style.background = "var(--bpmn-surface-hi)";
        e.currentTarget.style.color = "var(--bpmn-text)";
      }}
      onMouseLeave={(e) => {
        if (active) return;
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--bpmn-text-muted)";
      }}
    >
      {children}
    </button>
  );
}

function InlineEditor({
  element,
  view,
  layout,
  onCommit,
  onCancel,
}: {
  element: BpmnElement;
  view: ViewState;
  layout: ReturnType<typeof layoutGraph>;
  onCommit: (label: string) => void;
  onCancel: () => void;
}) {
  const node = layout.nodes.find((n) => n.id === element.id);
  const [val, setVal] = useState(element.label);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  if (!node) return null;
  const w = Math.max(node.w, 160) * view.k;
  const h = Math.max(node.h, 48) * view.k;
  const left = view.x + (node.x - Math.max(node.w, 160) / 2) * view.k;
  const top = view.y + (node.y - Math.max(node.h, 48) / 2) * view.k;
  return (
    <textarea
      ref={ref}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => onCommit(val.trim() || element.label)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onCommit(val.trim() || element.label);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      style={{
        position: "absolute",
        left,
        top,
        width: w,
        height: h,
        background: "var(--bpmn-surface-hi)",
        border: "1.5px solid var(--bpmn-cyan)",
        boxShadow: "0 0 0 4px color-mix(in srgb, var(--bpmn-cyan) 18%, transparent)",
        color: "var(--bpmn-text)",
        fontFamily: "var(--bpmn-font-mono)",
        fontSize: 11.5 * view.k,
        lineHeight: 1.35,
        padding: 8 * view.k,
        borderRadius: 8,
        resize: "none",
        outline: "none",
        zIndex: 20,
      }}
    />
  );
}

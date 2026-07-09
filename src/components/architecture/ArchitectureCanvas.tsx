import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import type {
  ArchEdge,
  ArchEdgeKind,
  ArchLayer,
  ArchNode,
  ArchNodeKind,
} from "@/types/architecture";
import { statusStyle } from "@/lib/status-colors";
import { layoutArchitecture } from "@/lib/architecture-layout";

/**
 * ArchitectureCanvas — the interactive system-design diagram. Nodes are SVG
 * groups (rect + text, never absolutely-positioned HTML) laid out by the
 * deterministic band layout, then made draggable; every edge carries a
 * draggable waypoint so its route can be bent by hand, the way a flowchart
 * tool lets you push a connector around. The initial layout is the durable
 * artifact; a reader's manual arrangement (node drags + edge bends + the
 * infrastructure toggle) is remembered per-repo in localStorage and can be
 * reset to the computed layout at any time.
 *
 * Tier drives emphasis: `primary` nodes render at full weight, while
 * `infrastructure` (caches, persistence, wiring, transport adapters) is faint
 * and can be toggled off entirely — the founder's rule that the diagram leads
 * with business capabilities and communication, not plumbing.
 */

interface Props {
  nodes: ArchNode[];
  edges: ArchEdge[];
  layers: ArchLayer[];
  /** Stable identity (the repo) — keys the saved manual arrangement. */
  storageKey: string;
}

interface XY {
  x: number;
  y: number;
}

/** Effective node box in layout coordinates — top-left (x,y) + size. */
interface Box {
  node: ArchNode;
  x: number;
  y: number;
  w: number;
  h: number;
}

type Drag =
  | { kind: "node"; id: string; pointerId: number; start: XY; pointer: XY; moved: boolean }
  | { kind: "wp"; id: string; pointerId: number; start: XY; pointer: XY; moved: boolean }
  | { kind: "pan"; pointerId: number; pointer: XY; startView: XY };

const MIN_K = 0.3;
const MAX_K = 2.5;

const KIND_META: Record<ArchNodeKind, { label: string; accent: string }> = {
  component: { label: "component", accent: "var(--bpmn-cyan)" },
  service: { label: "service", accent: "var(--bpmn-cyan)" },
  datastore: { label: "data store", accent: "var(--bpmn-mint)" },
  external: { label: "external", accent: "var(--bpmn-text-dim)" },
  topic: { label: "topic", accent: "hsl(265 55% 68%)" },
};

/** Dash/width per integration kind — everything is a dotted/dashed connector
 *  (the flowchart look), the pattern keeps the kind legible. */
const EDGE_KIND: Record<ArchEdgeKind, { dash: string; width: number }> = {
  sync: { dash: "7 5", width: 1.7 },
  async: { dash: "2 5", width: 1.7 },
  data: { dash: "6 5", width: 1.3 },
  dependency: { dash: "1 5", width: 1.2 },
};

const tierOf = (n: ArchNode) => n.tier ?? "primary";

function tint(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

// ─── geometry ────────────────────────────────────────────────────────────
const centerOf = (b: Box): XY => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** Where the segment from a box's centre toward `p` crosses the box border —
 *  so connectors touch the card edge, not its middle. */
function borderPoint(b: Box, p: XY): XY {
  const c = centerOf(b);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const hw = b.w / 2;
  const hh = b.h / 2;
  const sx = dx === 0 ? Infinity : hw / Math.abs(dx);
  const sy = dy === 0 ? Infinity : hh / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

function quadAt(p0: XY, p1: XY, p2: XY, t: number): XY {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

function edgeGeom(from: Box, to: Box, wp: XY | undefined) {
  const fc = centerOf(from);
  const tc = centerOf(to);
  const control = wp ?? { x: (fc.x + tc.x) / 2, y: (fc.y + tc.y) / 2 };
  const start = borderPoint(from, control);
  const end = borderPoint(to, control);
  const mid = quadAt(start, control, end, 0.5);
  const d = `M ${start.x},${start.y} Q ${control.x},${control.y} ${end.x},${end.y}`;
  return { d, start, end, control, mid };
}

// ─── text fitting (SVG <text> has no ellipsis) ─────────────────────────────
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 1) return s.slice(0, Math.max(0, max));
  return s.slice(0, max - 1).trimEnd() + "…";
}
function wrap(s: string, maxChars: number, maxLines: number): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (cand.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    } else {
      cur = cand;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  const used = lines.join(" ").replace(/\s+/g, " ").trim();
  if (lines.length === maxLines && used.length < s.replace(/\s+/g, " ").trim().length) {
    lines[maxLines - 1] = truncate(lines[maxLines - 1], maxChars);
  }
  return lines;
}

// ─── persistence ───────────────────────────────────────────────────────────
interface Persisted {
  pos?: [string, XY][];
  wp?: [string, XY][];
  showInfra?: boolean;
}
const lsKey = (k: string) => `underscore-arch:${k}`;
function loadPersisted(k: string): Persisted {
  try {
    const raw = localStorage.getItem(lsKey(k));
    return raw ? (JSON.parse(raw) as Persisted) : {};
  } catch {
    return {};
  }
}
function toMap(entries?: [string, XY][]): Map<string, XY> {
  return new Map(entries ?? []);
}

const ArchitectureCanvas = ({ nodes, edges, layers, storageKey }: Props) => {
  const initial = useMemo(() => loadPersisted(storageKey), [storageKey]);

  // Base layout: deterministic band positions the manual arrangement sits on
  // top of. Stale saved ids are ignored on apply (surgical updates keep ids
  // stable, so a reader's arrangement survives across commits).
  const base = useMemo(
    () => layoutArchitecture(nodes, edges, layers),
    [nodes, edges, layers]
  );

  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [pos, setPos] = useState<Map<string, XY>>(() => toMap(initial.pos));
  const [waypts, setWaypts] = useState<Map<string, XY>>(() => toMap(initial.wp));
  const [showInfra, setShowInfra] = useState<boolean>(initial.showInfra ?? true);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const userNavRef = useRef(false);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  // Effective box for every node (base position + manual override).
  const boxes = useMemo(() => {
    const out = new Map<string, Box>();
    for (const p of base.nodes) {
      const o = pos.get(p.node.id);
      out.set(p.node.id, {
        node: p.node,
        x: o ? o.x : p.x,
        y: o ? o.y : p.y,
        w: p.w,
        h: p.h,
      });
    }
    return out;
  }, [base.nodes, pos]);

  const infraCount = useMemo(
    () => nodes.filter((n) => tierOf(n) === "infrastructure").length,
    [nodes]
  );

  // Visible set — infrastructure drops out (with its edges) when toggled off.
  const visibleIds = useMemo(() => {
    const s = new Set<string>();
    for (const [id, b] of boxes) {
      if (!showInfra && tierOf(b.node) === "infrastructure") continue;
      s.add(id);
    }
    return s;
  }, [boxes, showInfra]);

  const visibleBoxes = useMemo(
    () => [...boxes.values()].filter((b) => visibleIds.has(b.node.id)),
    [boxes, visibleIds]
  );

  // Incident edges of the focused node — the through-lines to emphasise.
  const focusId = hover ?? sel;
  // Edges incident to the focused node, and the nodes on the other end — used
  // to spotlight a box's through-lines and its immediate neighbours.
  const { incident, connected } = useMemo(() => {
    if (!focusId) return { incident: null as Set<string> | null, connected: null as Set<string> | null };
    const inc = new Set<string>();
    const con = new Set<string>([focusId]);
    for (const e of edges) {
      if (e.from === focusId) {
        inc.add(e.id);
        con.add(e.to);
      } else if (e.to === focusId) {
        inc.add(e.id);
        con.add(e.from);
      }
    }
    return { incident: inc, connected: con };
  }, [focusId, edges]);

  const routed = useMemo(() => {
    const out: {
      edge: ArchEdge;
      d: string;
      control: XY;
      mid: XY;
      end: XY;
    }[] = [];
    for (const e of edges) {
      const a = boxes.get(e.from);
      const b = boxes.get(e.to);
      if (!a || !b) continue;
      if (!visibleIds.has(e.from) || !visibleIds.has(e.to)) continue;
      const g = edgeGeom(a, b, waypts.get(e.id));
      out.push({ edge: e, d: g.d, control: g.control, mid: g.mid, end: g.end });
    }
    return out;
  }, [edges, boxes, waypts, visibleIds]);

  // ─── fit-to-screen ────────────────────────────────────────────────────
  const fit = useCallback((): boolean => {
    const svg = svgRef.current;
    if (!svg || visibleBoxes.length === 0) return false;
    const cw = svg.clientWidth;
    const ch = svg.clientHeight;
    if (cw <= 0 || ch <= 0) return false;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of visibleBoxes) {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }
    const bw = maxX - minX || 1;
    const bh = maxY - minY || 1;
    const padX = 52;
    const padTop = 34;
    const padBottom = 40;
    const raw = Math.min((cw - padX * 2) / bw, (ch - padTop - padBottom) / bh);
    const k = Math.min(1.25, Math.max(MIN_K, raw));
    const x = (cw - bw * k) / 2 - minX * k;
    const freeV = ch - padTop - padBottom - bh * k;
    const y = padTop + Math.max(0, freeV) * 0.4 - minY * k;
    setView({ x, y, k });
    userNavRef.current = false;
    return true;
  }, [visibleBoxes]);

  const fitRef = useRef(fit);
  fitRef.current = fit;

  // Robust initial fit — retry across frames until the container has a real
  // size, then re-fit on resize only while the reader hasn't taken the camera.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let done = false;
    let raf: number | null = null;
    const started = performance.now();
    const tryFit = () => {
      if (done) return;
      if (fitRef.current()) {
        done = true;
        return;
      }
      if (performance.now() - started < 5000) raf = requestAnimationFrame(tryFit);
    };
    raf = requestAnimationFrame(tryFit);
    const ro = new ResizeObserver(() => {
      if (!done) {
        if (fitRef.current()) done = true;
      } else if (!userNavRef.current) {
        fitRef.current();
      }
    });
    ro.observe(svg);
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // Re-arm on structural change (a different repo/diagram), not on drags.
  }, [storageKey, base.nodes.length]);

  // ─── persistence write ────────────────────────────────────────────────
  useEffect(() => {
    try {
      const payload: Persisted = {
        pos: [...pos.entries()],
        wp: [...waypts.entries()],
        showInfra,
      };
      localStorage.setItem(lsKey(storageKey), JSON.stringify(payload));
    } catch {
      /* storage unavailable — arrangement is best-effort */
    }
  }, [pos, waypts, showInfra, storageKey]);

  // ─── pointer interaction ──────────────────────────────────────────────
  const onBgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.target !== e.currentTarget) return; // node/waypoint handled their own
    userNavRef.current = true;
    setSel(null);
    const v = viewRef.current;
    setDrag({
      kind: "pan",
      pointerId: e.pointerId,
      pointer: { x: e.clientX, y: e.clientY },
      startView: { x: v.x, y: v.y },
    });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const beginNodeDrag = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    userNavRef.current = true;
    setSel(id);
    const b = boxes.get(id);
    if (!b) return;
    const svg = svgRef.current;
    if (svg) {
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    setDrag({
      kind: "node",
      id,
      pointerId: e.pointerId,
      start: { x: b.x, y: b.y },
      pointer: { x: e.clientX, y: e.clientY },
      moved: false,
    });
  };

  const beginWpDrag = (e: React.PointerEvent, edge: ArchEdge, control: XY) => {
    e.stopPropagation();
    userNavRef.current = true;
    const svg = svgRef.current;
    if (svg) {
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    setDrag({
      kind: "wp",
      id: edge.id,
      pointerId: e.pointerId,
      start: waypts.get(edge.id) ?? control,
      pointer: { x: e.clientX, y: e.clientY },
      moved: false,
    });
  };

  const onBgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === "pan") {
      setView((v) => ({
        ...v,
        x: d.startView.x + (e.clientX - d.pointer.x),
        y: d.startView.y + (e.clientY - d.pointer.y),
      }));
      return;
    }
    const moved =
      d.moved ||
      Math.hypot(e.clientX - d.pointer.x, e.clientY - d.pointer.y) >= 4;
    if (!moved) return;
    if (!d.moved) dragRef.current = { ...d, moved: true };
    const v = viewRef.current;
    const dx = (e.clientX - d.pointer.x) / v.k;
    const dy = (e.clientY - d.pointer.y) / v.k;
    if (d.kind === "node") {
      const nx = Math.round((d.start.x + dx) / 8) * 8;
      const ny = Math.round((d.start.y + dy) / 8) * 8;
      setPos((m) => new Map(m).set(d.id, { x: nx, y: ny }));
    } else {
      setWaypts((m) =>
        new Map(m).set(d.id, { x: d.start.x + dx, y: d.start.y + dy })
      );
    }
  };

  const onBgPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (d) {
      try {
        (e.currentTarget as Element).releasePointerCapture(d.pointerId);
      } catch {
        /* ignore */
      }
    }
    setDrag(null);
  };

  const onWheel = useCallback((e: WheelEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    // The canvas owns the gesture (it's the scroll surface, no page behind):
    // plain two-finger scroll pans, ⌘/ctrl scroll zooms at the cursor.
    e.preventDefault();
    userNavRef.current = true;
    if (e.ctrlKey || e.metaKey) {
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setView((v) => {
        const nk = Math.max(MIN_K, Math.min(MAX_K, v.k * Math.exp(-e.deltaY * 0.01)));
        const ratio = nk / v.k;
        return { k: nk, x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio };
      });
    } else {
      setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    }
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  const zoomBy = (factor: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    userNavRef.current = true;
    const rect = svg.getBoundingClientRect();
    const mx = rect.width / 2;
    const my = rect.height / 2;
    setView((v) => {
      const nk = Math.max(MIN_K, Math.min(MAX_K, v.k * factor));
      const ratio = nk / v.k;
      return { k: nk, x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio };
    });
  };

  const reset = () => {
    setPos(new Map());
    setWaypts(new Map());
    setShowInfra(true);
    setSel(null);
    setHover(null);
    // fit re-runs against the cleared arrangement on the next frame.
    requestAnimationFrame(() => fitRef.current());
  };

  const panning = drag?.kind === "pan";

  return (
    <div className="relative h-full w-full">
      {/* Floating toolbar — bottom-right, quiet at rest. */}
      <div className="absolute right-3 z-10 flex flex-col items-end gap-2" style={{ bottom: 14 }}>
        {infraCount > 0 && (
          <button
            type="button"
            onClick={() => setShowInfra((s) => !s)}
            className="flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] tracking-wide uppercase transition-colors"
            style={{
              borderColor: "var(--bpmn-border-em)",
              background: "var(--bpmn-surface)",
              color: showInfra ? "var(--bpmn-text-muted)" : "var(--bpmn-text-dim)",
            }}
            title={
              showInfra
                ? "Hide infrastructure (caches, persistence, wiring)"
                : "Show infrastructure"
            }
          >
            {showInfra ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            infra · {infraCount}
          </button>
        )}
        <div
          className="flex items-center gap-0.5 rounded-md border p-0.5"
          style={{ borderColor: "var(--bpmn-border-em)", background: "var(--bpmn-surface)" }}
        >
          <ToolBtn onClick={() => zoomBy(1.2)} title="Zoom in">
            <Plus className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => zoomBy(1 / 1.2)} title="Zoom out">
            <Minus className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => fit()} title="Fit to screen">
            <Maximize2 className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn onClick={reset} title="Reset layout (undo all moves)">
            <RotateCcw className="h-3.5 w-3.5" />
          </ToolBtn>
        </div>
      </div>

      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full"
        style={{ cursor: panning ? "grabbing" : "default", touchAction: "none" }}
        onPointerDown={onBgPointerDown}
        onPointerMove={onBgPointerMove}
        onPointerUp={onBgPointerUp}
        onPointerCancel={onBgPointerUp}
      >
        <defs>
          <pattern id="arch-dot-grid" width={26} height={26} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={1} fill="var(--bpmn-border)" opacity={0.5} />
          </pattern>
          <ArchArrow id="arch-arrow" color="var(--bpmn-border-em)" />
          <ArchArrow id="arch-arrow-hi" color="var(--bpmn-cyan)" />
          <ArchArrow id="arch-arrow-added" color="var(--bpmn-mint)" />
          <ArchArrow id="arch-arrow-modified" color="var(--bpmn-amber)" />
          <ArchArrow id="arch-arrow-removed" color="var(--bpmn-rose)" />
          <filter id="arch-card-shadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" floodColor="hsla(220,40%,3%,0.55)" />
          </filter>
        </defs>

        <rect x={0} y={0} width="100%" height="100%" fill="var(--bpmn-canvas)" pointerEvents="none" />
        <rect x={0} y={0} width="100%" height="100%" fill="url(#arch-dot-grid)" pointerEvents="none" />

        <g transform={`translate(${view.x}, ${view.y}) scale(${view.k})`}>
          {/* Layer swimlanes — faint orientation guides behind everything. */}
          {base.bands.map((band) => (
            <g key={band.id} pointerEvents="none">
              <rect
                x={-40}
                y={band.y + 26}
                width={base.width + 80}
                height={Math.max(0, band.height - 26)}
                rx={12}
                fill={band.synthetic ? "transparent" : "var(--bpmn-surface-soft)"}
                opacity={band.synthetic ? 1 : 0.35}
                stroke="var(--bpmn-border-soft)"
                strokeWidth={1}
              />
              <text
                x={-32}
                y={band.y + 20}
                fontFamily="var(--bpmn-font-mono)"
                fontSize={10}
                letterSpacing={2}
                fill="var(--bpmn-text-dim)"
                style={{ textTransform: "uppercase" }}
              >
                {band.name.toUpperCase()}
              </text>
            </g>
          ))}

          {/* Edges — dotted connectors with a draggable waypoint each. */}
          {routed.map(({ edge, d, control, mid, end }) => {
            const on = !!incident && incident.has(edge.id);
            const dimmed = !!incident && !on;
            const st = edge.prStatus ? statusStyle(edge.prStatus).solid : null;
            const removed = edge.prStatus === "removed";
            const base = EDGE_KIND[edge.kind] ?? EDGE_KIND.sync;
            const stroke = st ?? (on ? "var(--bpmn-cyan)" : "var(--bpmn-border-em)");
            const marker = edge.prStatus
              ? `url(#arch-arrow-${edge.prStatus})`
              : on
                ? "url(#arch-arrow-hi)"
                : "url(#arch-arrow)";
            const dashed = edge.kind === "async" && !on;
            const angle = Math.atan2(end.y - control.y, end.x - control.x);
            return (
              <g key={edge.id} opacity={dimmed ? 0.28 : 1}>
                {/* fat invisible hit-path for hover + grabbing the line */}
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16}
                  style={{ cursor: "grab" }}
                  onPointerEnter={() => setHover(edge.from)}
                  onPointerLeave={() => setHover((h) => (h === edge.from ? null : h))}
                  onPointerDown={(e) => beginWpDrag(e, edge, control)}
                />
                <path
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={base.width + (on ? 0.8 : 0) - (removed ? 0.4 : 0)}
                  strokeDasharray={removed ? "3 4" : base.dash}
                  strokeLinecap="round"
                  opacity={removed ? 0.6 : st ? 1 : on ? 1 : 0.8}
                  markerEnd={marker}
                  className={on ? "arch-edge-flow" : undefined}
                  pointerEvents="none"
                />
                {/* waypoint handle — grab to bend the line */}
                <circle
                  cx={control.x}
                  cy={control.y}
                  r={on || waypts.has(edge.id) ? 4.5 : 3}
                  fill="var(--bpmn-surface-hi)"
                  stroke={stroke}
                  strokeWidth={1.4}
                  opacity={on || waypts.has(edge.id) ? 0.95 : 0.35}
                  style={{ cursor: "grab" }}
                  onPointerDown={(e) => beginWpDrag(e, edge, control)}
                  onPointerEnter={() => setHover(edge.from)}
                  onPointerLeave={() => setHover((h) => (h === edge.from ? null : h))}
                />
                {edge.label && (
                  <EdgeLabel
                    x={mid.x}
                    y={mid.y}
                    text={edge.label}
                    color={st ?? "var(--bpmn-text-dim)"}
                    rotate={Math.abs(angle) > 1.3 ? 0 : (angle * 180) / Math.PI}
                    dim={dimmed}
                  />
                )}
              </g>
            );
          })}

          {/* Nodes — SVG groups, draggable. */}
          {visibleBoxes.map((b) => (
            <NodeGroup
              key={b.node.id}
              box={b}
              focused={focusId === b.node.id}
              dimmed={!!connected && !connected.has(b.node.id)}
              faint={tierOf(b.node) === "infrastructure"}
              onPointerDown={(e) => beginNodeDrag(e, b.node.id)}
              onEnter={() => setHover(b.node.id)}
              onLeave={() => setHover((h) => (h === b.node.id ? null : h))}
            />
          ))}
        </g>
      </svg>
    </div>
  );
};

const ToolBtn = ({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--bpmn-surface-hi)]"
    style={{ color: "var(--bpmn-text-muted)" }}
  >
    {children}
  </button>
);

function ArchArrow({ id, color }: { id: string; color: string }) {
  return (
    <marker
      id={id}
      viewBox="0 0 8 8"
      refX="7"
      refY="4"
      markerWidth="6"
      markerHeight="6"
      orient="auto-start-reverse"
    >
      <path d="M0,0 L8,4 L0,8 z" fill={color} />
    </marker>
  );
}

function EdgeLabel({
  x,
  y,
  text,
  color,
  rotate,
  dim,
}: {
  x: number;
  y: number;
  text: string;
  color: string;
  rotate: number;
  dim: boolean;
}) {
  const label = truncate(text, 24);
  const w = label.length * 5.6 + 10;
  return (
    <g transform={`translate(${x}, ${y}) rotate(${rotate})`} opacity={dim ? 0.35 : 1} pointerEvents="none">
      <rect
        x={-w / 2}
        y={-8}
        width={w}
        height={16}
        rx={4}
        fill="var(--page-bg)"
        stroke="var(--bpmn-border-soft)"
        strokeWidth={0.75}
      />
      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--bpmn-font-mono)"
        fontSize={9}
        fill={color}
      >
        {label}
      </text>
    </g>
  );
}

function NodeGroup({
  box,
  focused,
  dimmed,
  faint,
  onPointerDown,
  onEnter,
  onLeave,
}: {
  box: Box;
  focused: boolean;
  dimmed: boolean;
  faint: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { node, x, y, w, h } = box;
  const meta = KIND_META[node.kind] ?? KIND_META.component;
  const topic = node.kind === "topic";
  const external = node.kind === "external";
  const st = node.prStatus ? statusStyle(node.prStatus) : null;
  const border = st ? st.solid : focused ? "var(--bpmn-cyan)" : "var(--bpmn-border-em)";
  const fill = st ? tint(st.solid, 12) : topic ? tint(meta.accent, 10) : "var(--bpmn-surface)";
  // Infrastructure recedes; focus/PR-change always pull it back to full weight.
  const opacity = faint && !focused && !st ? 0.5 : dimmed ? 0.4 : 1;

  const nameChars = Math.floor((w - 24) / 7.2);
  const descChars = Math.floor((w - 22) / 5.4);
  const descLines = !topic && node.description ? wrap(node.description, descChars, 2) : [];

  return (
    <g
      transform={`translate(${x}, ${y})`}
      opacity={opacity}
      style={{ cursor: "grab" }}
      onPointerDown={onPointerDown}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={topic ? h / 2 : 10}
        fill={fill}
        stroke={border}
        strokeWidth={focused || st ? 1.8 : 1}
        strokeDasharray={external ? "5 3" : undefined}
        filter={faint || topic ? undefined : "url(#arch-card-shadow)"}
      />
      {/* kind accent dot */}
      <circle cx={14} cy={topic ? h / 2 : 17} r={3} fill={st ? st.solid : meta.accent} />

      {topic ? (
        <text
          x={26}
          y={h / 2}
          dominantBaseline="central"
          fontFamily="var(--bpmn-font-mono)"
          fontSize={12}
          fontWeight={600}
          fill="var(--bpmn-text)"
        >
          {truncate(node.name, Math.floor((w - 34) / 7.2))}
        </text>
      ) : (
        <>
          <text
            x={24}
            y={20}
            fontFamily="var(--bpmn-font-mono)"
            fontSize={8.5}
            letterSpacing={1.4}
            fill="var(--bpmn-text-dim)"
            style={{ textTransform: "uppercase" }}
          >
            {meta.label.toUpperCase()}
          </text>
          {st && (
            <StatusBadge x={w - 8} y={16} color={st.solid} label={st.label} />
          )}
          <text
            x={12}
            y={40}
            fontFamily="var(--bpmn-font-mono)"
            fontSize={12.5}
            fontWeight={600}
            fill={external ? "var(--bpmn-text-muted)" : "var(--bpmn-text)"}
          >
            {truncate(node.name, nameChars)}
          </text>
          {descLines.map((ln, i) => (
            <text
              key={i}
              x={12}
              y={56 + i * 13}
              fontFamily="var(--reading-font)"
              fontSize={10.5}
              fill="var(--bpmn-text-muted)"
            >
              {ln}
            </text>
          ))}
        </>
      )}
    </g>
  );
}

function StatusBadge({
  x,
  y,
  color,
  label,
}: {
  x: number;
  y: number;
  color: string;
  label: string;
}) {
  const w = label.length * 5.2 + 10;
  return (
    <g transform={`translate(${x - w}, ${y - 8})`} pointerEvents="none">
      <rect x={0} y={0} width={w} height={14} rx={7} fill={tint(color, 22)} />
      <text
        x={w / 2}
        y={7}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--bpmn-font-mono)"
        fontSize={7.5}
        letterSpacing={0.6}
        fill={color}
        style={{ textTransform: "uppercase" }}
      >
        {label.toUpperCase()}
      </text>
    </g>
  );
}

export default ArchitectureCanvas;

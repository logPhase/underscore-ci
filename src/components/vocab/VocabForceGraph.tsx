/**
 * The Obsidian-style vocabulary graph — live force physics on the repo's
 * ubiquitous language. Nodes unfurl into place on load, a dragged term
 * pulls its neighbours elastically and the graph re-settles on release,
 * hovering a term lights its neighbourhood and fades everything else —
 * the exact reading Obsidian's graph view gives a vault.
 *
 * Camera: plain scroll zooms (cursor-anchored), background drag pans. The
 * camera auto-fits the unfurling graph until the reader's first gesture,
 * then it is theirs. Labels fade in with zoom (hover/selection always
 * shows them). `prefers-reduced-motion` snaps the simulation to rest
 * instead of animating it; dragging then re-settles instantly on release.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { VocabSim } from "@/lib/vocab-sim";
import type { VocabTerm } from "@/types/vocabulary";

const MIN_K = 0.15;
const MAX_K = 4;

interface Props {
  terms: VocabTerm[];
  capColor: Map<string, string>;
  selected: string | null;
  onSelect: (slug: string | null) => void;
  /** Search filter — when set, non-matching terms fade (Obsidian's search
   *  dim). null = no active query. */
  isMatch: ((t: VocabTerm) => boolean) | null;
}

export function VocabForceGraph({ terms, capColor, selected, onSelect, isMatch }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState({ w: 900, h: 600 });
  const [, setFrame] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  // Camera is auto-fit until the reader's first gesture, then theirs.
  const userCamRef = useRef(false);
  const reduced = useMemo(
    () => typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const sim = useMemo(() => new VocabSim(terms), [terms]);
  const bySlug = useMemo(() => new Map(terms.map((t) => [t.slug, t])), [terms]);
  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of sim.edges) {
      (m.get(e.from) ?? m.set(e.from, new Set()).get(e.from)!).add(e.to);
      (m.get(e.to) ?? m.set(e.to, new Set()).get(e.to)!).add(e.from);
    }
    return m;
  }, [sim]);

  // ── the animation loop ─────────────────────────────────────────────
  const runningRef = useRef(false);
  const fitToNodes = () => {
    if (sim.nodes.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of sim.nodes) {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
    }
    const { w, h } = sizeRef.current;
    const bw = Math.max(maxX - minX, 60) + 160;
    const bh = Math.max(maxY - minY, 60) + 160;
    const k = Math.min(w / bw, h / bh, 1.5);
    setView({ x: -((minX + maxX) / 2) * k, y: -((minY + maxY) / 2) * k, k });
  };
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const kick = () => {
    if (runningRef.current) return;
    runningRef.current = true;
    const loop = () => {
      const hot = sim.tick();
      if (!userCamRef.current) fitToNodes();
      setFrame((f) => f + 1);
      if (hot) requestAnimationFrame(loop);
      else runningRef.current = false;
    };
    requestAnimationFrame(loop);
  };
  const kickRef = useRef(kick);
  kickRef.current = kick;

  useEffect(() => {
    if (reduced) {
      sim.settle();
      if (!userCamRef.current) fitToNodes();
      setFrame((f) => f + 1);
    } else {
      kickRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, reduced]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(1, r.width), h: Math.max(1, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Wheel zoom needs a NON-passive native listener (React's synthetic
  // wheel cannot preventDefault the page scroll).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      userCamRef.current = true;
      const r = svg.getBoundingClientRect();
      const px = e.clientX - r.left - r.width / 2;
      const py = e.clientY - r.top - r.height / 2;
      setView((v) => {
        const k = Math.min(MAX_K, Math.max(MIN_K, v.k * Math.exp(-e.deltaY * 0.0022)));
        const s = k / v.k;
        return { k, x: px - (px - v.x) * s, y: py - (py - v.y) * s };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // ── pointer interactions: node drag / click, background pan ────────
  const gestureRef = useRef<
    | { kind: "node"; slug: string; moved: boolean; sx: number; sy: number }
    | { kind: "pan"; sx: number; sy: number; ox: number; oy: number }
    | null
  >(null);

  const toGraph = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (clientX - r.left - r.width / 2 - v.x) / v.k,
      y: (clientY - r.top - r.height / 2 - v.y) / v.k,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g) return;
    if (g.kind === "pan") {
      setView((v) => ({ ...v, x: g.ox + (e.clientX - g.sx), y: g.oy + (e.clientY - g.sy) }));
      return;
    }
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 3) return;
    if (!g.moved) {
      g.moved = true;
      sim.reheat();
      if (!reduced) kickRef.current();
    }
    const p = toGraph(e.clientX, e.clientY);
    sim.pin(g.slug, p.x, p.y);
    if (reduced) {
      sim.tick();
      setFrame((f) => f + 1);
    }
  };

  const onPointerUp = () => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;
    if (g.kind === "node") {
      if (g.moved) {
        sim.unpin(g.slug);
        sim.cool();
        if (reduced) {
          sim.settle();
          setFrame((f) => f + 1);
        }
      } else {
        onSelect(g.slug);
      }
    }
  };

  // ── per-node presentation state (the Obsidian dim/highlight model) ──
  const hoverSet = hovered
    ? new Set([hovered, ...(neighbors.get(hovered) ?? [])])
    : null;
  const labelAlpha = Math.max(0, Math.min(1, (view.k - 0.62) / 0.4));

  const nodeOpacity = (slug: string, term: VocabTerm) => {
    if (hoverSet) return hoverSet.has(slug) ? 1 : 0.1;
    if (isMatch) return isMatch(term) ? 1 : 0.12;
    return 1;
  };
  const linkStyle = (from: string, to: string) => {
    if (hoverSet) {
      const lit = hoverSet.has(from) && hoverSet.has(to) &&
        (from === hovered || to === hovered);
      return { opacity: lit ? 0.95 : 0.05, width: lit ? 1.8 : 1.1 };
    }
    if (isMatch) {
      const lit = isMatch(bySlug.get(from)!) && isMatch(bySlug.get(to)!);
      return { opacity: lit ? 0.55 : 0.06, width: 1.1 };
    }
    return { opacity: 0.4, width: 1.1 };
  };

  return (
    <div ref={containerRef} className="h-full w-full" style={{ background: "var(--bpmn-canvas)" }}>
      <svg
        ref={svgRef}
        className="h-full w-full touch-none select-none"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            userCamRef.current = true;
            gestureRef.current = {
              kind: "pan", sx: e.clientX, sy: e.clientY,
              ox: viewRef.current.x, oy: viewRef.current.y,
            };
            (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
          }
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <g transform={`translate(${size.w / 2 + view.x}, ${size.h / 2 + view.y}) scale(${view.k})`}>
          {sim.edges.map((e) => {
            const a = sim.nodes[e.i];
            const b = sim.nodes[e.j];
            const s = linkStyle(e.from, e.to);
            return (
              <line
                key={`${e.from}|${e.to}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="var(--bpmn-border-em)"
                strokeWidth={s.width / view.k}
                style={{ opacity: s.opacity, transition: "opacity 150ms ease" }}
              />
            );
          })}
          {sim.nodes.map((n) => {
            const t = bySlug.get(n.slug)!;
            const color = capColor.get(t.capability) ?? "var(--bpmn-text-muted)";
            const isSel = selected === n.slug;
            const isHover = hovered === n.slug;
            const r = (4.5 + Math.min(9, n.degree * 1.7)) * (isHover ? 1.25 : 1);
            const op = nodeOpacity(n.slug, t);
            const showLabel = isHover || isSel || (hoverSet?.has(n.slug) ?? false)
              ? 1
              : labelAlpha * op;
            return (
              <g
                key={n.slug}
                style={{ cursor: "pointer", opacity: op, transition: "opacity 150ms ease" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  gestureRef.current = {
                    kind: "node", slug: n.slug, moved: false,
                    sx: e.clientX, sy: e.clientY,
                  };
                  (e.currentTarget.ownerSVGElement as SVGSVGElement)
                    .setPointerCapture(e.pointerId);
                }}
                onPointerEnter={() => setHovered(n.slug)}
                onPointerLeave={() => setHovered((h) => (h === n.slug ? null : h))}
              >
                {/* generous invisible hit area — small dots stay grabbable */}
                <circle cx={n.x} cy={n.y} r={r + 8} fill="transparent" />
                <circle
                  cx={n.x} cy={n.y} r={r}
                  fill={color}
                  stroke={isSel ? "var(--bpmn-cyan)" : "transparent"}
                  strokeWidth={isSel ? 2.2 / view.k : 0}
                  style={isHover || isSel ? {
                    filter: `drop-shadow(0 0 ${8 / view.k}px color-mix(in srgb, ${color} 70%, transparent))`,
                  } : undefined}
                />
                {t.notes.length > 0 && (
                  <circle cx={n.x + r * 0.9} cy={n.y - r * 0.9} r={2.6} fill="var(--bpmn-amber)" pointerEvents="none">
                    <title>language notes recorded</title>
                  </circle>
                )}
                {showLabel > 0.02 && (
                  <text
                    x={n.x} y={n.y + r + 12}
                    textAnchor="middle"
                    fontSize={11.5}
                    fontFamily="var(--bpmn-font-title)"
                    fontWeight={isSel || isHover ? 600 : 450}
                    fill="var(--bpmn-text)"
                    pointerEvents="none"
                    style={{ opacity: showLabel, transition: "opacity 150ms ease" }}
                  >
                    {t.name}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

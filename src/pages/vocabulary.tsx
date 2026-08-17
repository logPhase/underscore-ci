/**
 * The Vocabulary view — the repo's ubiquitous language as a graph.
 *
 * Nodes are terms, sized by connectedness; hulls tint each capability's
 * cluster — the DDD context map, emergent rather than drawn. The layout is
 * force-directed but SEEDED and run once at build (see vocab-layout.ts):
 * same terms, same picture, every load. A node can be dragged to untangle a
 * local knot — deliberate, reader-initiated motion — but nothing moves on
 * its own, ever.
 *
 * Left rail: search + capability-grouped term list. Click (node or list
 * row) → detail panel: definition, code anchors, business usage, journeys,
 * language notes. Terms whose notes record drift carry an amber tick.
 */
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAnalysis } from "@/store/use-analysis-store";
import { getChapterById, getMethodInfo } from "@/data/parity-loader";
import { layoutVocabulary } from "@/lib/vocab-layout";
import type { VocabTerm } from "@/types/vocabulary";
import { X } from "lucide-react";

// The report's categorical palette, reused so capabilities read in the same
// visual language as the rest of the app. Assignment is by sorted index —
// deterministic for a given capability set.
const CAP_COLORS = [
  "var(--bpmn-mint)", "var(--bpmn-cyan)", "var(--bpmn-amber)",
  "var(--bpmn-rose)", "var(--bpmn-text-muted)", "var(--bpmn-text)",
];

export default function VocabularyPage() {
  const vocabulary = useAnalysis((s) => s.transformedData?.vocabulary) ?? null;
  const terms = useMemo(() => vocabulary?.terms ?? [], [vocabulary]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  // Reader-initiated drag overrides, on top of the deterministic layout.
  const [dragged, setDragged] = useState<Map<string, { x: number; y: number }>>(new Map());
  const dragRef = useRef<{ slug: string; dx: number; dy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const layout = useMemo(() => layoutVocabulary(terms), [terms]);
  const bySlug = useMemo(() => new Map(terms.map(t => [t.slug, t])), [terms]);
  const capColor = useMemo(() => {
    const caps = [...new Set(terms.map(t => t.capability))].sort();
    return new Map(caps.map((c, i) => [c, CAP_COLORS[i % CAP_COLORS.length]]));
  }, [terms]);

  const pos = (slug: string) => {
    const o = dragged.get(slug);
    if (o) return o;
    const n = layout.nodes.find(n => n.slug === slug)!;
    return { x: n.x, y: n.y };
  };

  const q = query.trim().toLowerCase();
  const matches = (t: VocabTerm) =>
    !q || t.name.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q) ||
    t.code.some(c => c.fqn.toLowerCase().includes(q) || c.alias.toLowerCase().includes(q));

  const sel = selected ? bySlug.get(selected) ?? null : null;

  const svgPoint = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return {
      x: ((e.clientX - r.left) / r.width) * vb.width,
      y: ((e.clientY - r.top) / r.height) * vb.height,
    };
  };

  if (terms.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <div>
          <div className="font-mono text-[10px] uppercase" style={{ color: "var(--bpmn-mint)", letterSpacing: 3 }}>
            vocabulary
          </div>
          <p className="mt-3 max-w-[44ch] text-[13px] leading-relaxed" style={{ color: "var(--bpmn-text-muted)" }}>
            No vocabulary recorded yet. The analyzer's synthesis agent writes the
            first terms on the next enriched analysis of this repository.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── search rail ─────────────────────────────────────────────── */}
      <div className="flex w-64 shrink-0 flex-col" style={{ borderRight: "1px solid var(--bpmn-border-soft)" }}>
        <div className="p-3" style={{ borderBottom: "1px solid var(--bpmn-border-soft)" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${terms.length} terms…`}
            className="w-full rounded-md px-2.5 py-1.5 font-mono text-[11px] outline-none"
            style={{
              background: "var(--bpmn-bg-deep)",
              border: "1px solid var(--bpmn-border-soft)",
              color: "var(--bpmn-text)",
            }}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {[...capColor.keys()].map(cap => {
            const rows = terms.filter(t => t.capability === cap && matches(t));
            if (!rows.length) return null;
            return (
              <div key={cap} className="mb-3">
                <div className="px-1 font-mono text-[8.5px] uppercase" style={{ color: capColor.get(cap), letterSpacing: 1.4 }}>
                  {cap}
                </div>
                {rows.map(t => (
                  <button
                    key={t.slug}
                    onClick={() => setSelected(t.slug)}
                    className="mt-0.5 flex w-full items-baseline gap-1.5 rounded px-1.5 py-1 text-left text-[12px] transition-colors"
                    style={{
                      color: selected === t.slug ? "var(--bpmn-text)" : "var(--bpmn-text-muted)",
                      background: selected === t.slug ? "color-mix(in srgb, var(--bpmn-cyan) 12%, transparent)" : "transparent",
                    }}
                  >
                    <span className="min-w-0 truncate">{t.name}</span>
                    {t.notes.length > 0 && (
                      <span title={`${t.notes.length} language note(s)`} className="ml-auto shrink-0 font-mono text-[9px]" style={{ color: "var(--bpmn-amber)" }}>
                        ✻
                      </span>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── the graph ───────────────────────────────────────────────── */}
      <div className="relative min-w-0 flex-1" style={{ background: "var(--bpmn-bg)" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="h-full w-full"
          onPointerMove={(e) => {
            const d = dragRef.current;
            if (!d) return;
            const p = svgPoint(e);
            setDragged(prev => new Map(prev).set(d.slug, { x: p.x - d.dx, y: p.y - d.dy }));
          }}
          onPointerUp={() => { dragRef.current = null; }}
          onPointerLeave={() => { dragRef.current = null; }}
        >
          {/* capability hulls — the wash that makes clusters legible */}
          {layout.hulls.map(h => h.points.length >= 3 && (
            <polygon
              key={h.capability}
              points={h.points.map(p => `${p.x},${p.y}`).join(" ")}
              fill={`color-mix(in srgb, ${capColor.get(h.capability)} 7%, transparent)`}
              stroke={`color-mix(in srgb, ${capColor.get(h.capability)} 22%, transparent)`}
              strokeWidth={26}
              strokeLinejoin="round"
              pointerEvents="none"
            />
          ))}
          {/* related-term edges */}
          {layout.edges.map(e => {
            const a = pos(e.from), b = pos(e.to);
            const dim = q && !(matches(bySlug.get(e.from)!) && matches(bySlug.get(e.to)!));
            return (
              <line
                key={`${e.from}|${e.to}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="var(--bpmn-border-em)"
                strokeWidth={1.4}
                opacity={dim ? 0.15 : 0.55}
              />
            );
          })}
          {/* term nodes */}
          {terms.map(t => {
            const p = pos(t.slug);
            const n = layout.nodes.find(n => n.slug === t.slug)!;
            const r = 7 + Math.min(9, n.degree * 2.2);
            const dim = q ? !matches(t) : false;
            const isSel = selected === t.slug;
            return (
              <g
                key={t.slug}
                opacity={dim ? 0.22 : 1}
                style={{ cursor: "pointer" }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  const sp = svgPoint(e);
                  dragRef.current = { slug: t.slug, dx: sp.x - p.x, dy: sp.y - p.y };
                }}
                onClick={() => setSelected(t.slug)}
              >
                <circle
                  cx={p.x} cy={p.y} r={r}
                  fill={`color-mix(in srgb, ${capColor.get(t.capability)} ${isSel ? 42 : 24}%, var(--bpmn-surface))`}
                  stroke={isSel ? "var(--bpmn-cyan)" : capColor.get(t.capability)}
                  strokeWidth={isSel ? 2.4 : 1.4}
                />
                {t.notes.length > 0 && (
                  <circle cx={p.x + r * 0.85} cy={p.y - r * 0.85} r={3} fill="var(--bpmn-amber)" pointerEvents="none">
                    <title>language notes recorded</title>
                  </circle>
                )}
                <text
                  x={p.x} y={p.y + r + 13}
                  textAnchor="middle"
                  fontSize={12.5}
                  fontFamily="var(--bpmn-font-title)"
                  fontWeight={isSel ? 650 : 480}
                  fill="var(--bpmn-text)"
                  pointerEvents="none"
                >
                  {t.name}
                </text>
              </g>
            );
          })}
        </svg>

        {/* ── detail panel ──────────────────────────────────────────── */}
        {sel && (
          <div
            className="absolute right-4 top-4 bottom-4 flex w-[26rem] max-w-[46%] flex-col overflow-hidden rounded-xl"
            style={{
              background: "color-mix(in srgb, var(--bpmn-bg-deep) 88%, transparent)",
              backdropFilter: "blur(12px)",
              border: "1px solid color-mix(in srgb, var(--bpmn-cyan) 18%, var(--bpmn-border-soft))",
              boxShadow: "0 14px 40px rgb(0 0 0 / 0.4)",
            }}
          >
            <div className="flex items-start gap-2 px-4 pt-3 pb-2.5" style={{ borderBottom: "1px solid var(--bpmn-border-soft)" }}>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[8.5px] uppercase" style={{ color: capColor.get(sel.capability), letterSpacing: 1.4 }}>
                  {sel.capability}
                </div>
                <div className="mt-0.5 text-[16px] font-semibold" style={{ color: "var(--bpmn-text)", fontFamily: "var(--bpmn-font-title)" }}>
                  {sel.name}
                </div>
              </div>
              <button onClick={() => setSelected(null)} aria-label="Close term" className="-mr-1 p-1.5" style={{ color: "var(--bpmn-text-dim)" }}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-[12.5px] leading-relaxed" style={{ color: "var(--bpmn-text-muted)" }}>
              <p style={{ color: "var(--bpmn-text)" }}>{sel.definition}</p>

              {sel.business && (
                <>
                  <SectionLabel>business usage</SectionLabel>
                  <p>{sel.business}</p>
                </>
              )}

              {sel.code.length > 0 && (
                <>
                  <SectionLabel>in the code</SectionLabel>
                  {sel.code.map(c => {
                    const info = getMethodInfo(c.fqn) ?? getMethodInfo(c.fqn.split("(")[0]);
                    return (
                      <div key={c.fqn} className="mt-1 rounded-md px-2.5 py-1.5 font-mono text-[10.5px]"
                           style={{ background: "var(--bpmn-bg-deep)", border: "1px solid var(--bpmn-border-soft)" }}>
                        <div style={{ color: "var(--bpmn-cyan)" }}>{c.fqn.split(".").slice(-2).join(".")}</div>
                        {/* Grounding is renderer-side: an anchor the method
                            index cannot resolve renders as text, not a link
                            — an invented symbol gets no credibility. */}
                        <div style={{ color: "var(--bpmn-text-dim)" }}>
                          {info?.filePath ?? c.fqn}
                          {c.alias && <span style={{ color: "var(--bpmn-amber)" }}> · as "{c.alias}"</span>}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {sel.journeys.length > 0 && (
                <>
                  <SectionLabel>appears in</SectionLabel>
                  {sel.journeys.map(j => {
                    const ch = getChapterById(j);
                    return ch
                      ? <Link key={j} to={`/journeys/${ch.slug}`} className="mr-2 underline" style={{ color: "var(--bpmn-cyan)" }}>{ch.title}</Link>
                      : <span key={j} className="mr-2 font-mono text-[10.5px]">{j}</span>;
                  })}
                </>
              )}

              {sel.notes.length > 0 && (
                <>
                  <SectionLabel color="var(--bpmn-amber)">language notes</SectionLabel>
                  {sel.notes.map((n, i) => (
                    <p key={i} className="mt-1 rounded-md px-2.5 py-1.5"
                       style={{ background: "color-mix(in srgb, var(--bpmn-amber) 8%, transparent)", borderLeft: "2px solid var(--bpmn-amber)" }}>
                      {n}
                    </p>
                  ))}
                </>
              )}

              {sel.related.length > 0 && (
                <>
                  <SectionLabel>related</SectionLabel>
                  {sel.related.filter(r => bySlug.has(r)).map(r => (
                    <button key={r} onClick={() => setSelected(r)} className="mr-2 underline" style={{ color: "var(--bpmn-cyan)" }}>
                      {bySlug.get(r)!.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children, color = "var(--bpmn-mint)" }: {
  children: React.ReactNode; color?: string;
}) {
  return (
    <div className="mt-3.5 mb-1 font-mono text-[8.5px] uppercase" style={{ color, letterSpacing: 1.4 }}>
      {children}
    </div>
  );
}

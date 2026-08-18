/**
 * The Vocabulary view — the repo's ubiquitous language as a LIVE graph.
 *
 * The graph is Obsidian-style force physics (an explicit product decision,
 * 2026-08-18): terms drift into place on load, a dragged node pulls its
 * neighbours elastically and the graph re-settles, hovering a term lights
 * its neighbourhood and fades the rest. Capability = node colour — the DDD
 * context map reads through the clustering the springs produce. The
 * simulation is seeded from the term slugs with a fixed timestep, so an
 * untouched graph still settles into the same picture every load
 * (vocab-sim.ts); `prefers-reduced-motion` snaps it to rest.
 *
 * Left rail: search + capability-grouped term list. Click (node or list
 * row) → detail panel: definition, code anchors, business usage, journeys,
 * language notes. Terms whose notes record drift carry an amber tick.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAnalysis } from "@/store/use-analysis-store";
import { getChapterById, getMethodInfo } from "@/data/parity-loader";
import { VocabForceGraph } from "@/components/vocab/VocabForceGraph";
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

  const bySlug = useMemo(() => new Map(terms.map(t => [t.slug, t])), [terms]);
  const capColor = useMemo(() => {
    const caps = [...new Set(terms.map(t => t.capability))].sort();
    return new Map(caps.map((c, i) => [c, CAP_COLORS[i % CAP_COLORS.length]]));
  }, [terms]);

  const q = query.trim().toLowerCase();
  const matches = (t: VocabTerm) =>
    !q || t.name.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q) ||
    t.code.some(c => c.fqn.toLowerCase().includes(q) || c.alias.toLowerCase().includes(q));

  const sel = selected ? bySlug.get(selected) ?? null : null;

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
        <VocabForceGraph
          terms={terms}
          capColor={capColor}
          selected={selected}
          onSelect={setSelected}
          isMatch={q ? matches : null}
        />

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

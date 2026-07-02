/**
 * JourneyOverview — the orientation page for a journey within its PR.
 *
 * Talks about the JOURNEY, not the code: no method lists, no code
 * references (those live in the Business flow / Call graph popups).
 *
 *   1. THE PULL REQUEST   — what the whole PR does (agent narrative)
 *   2. THE HUB            — current journey (large card: role + what it
 *                           does) wired to the journeys it connects to;
 *                           each neighbor is a text block: what that
 *                           journey does + HOW it relates to this one.
 *                           Solid connector = verified from call trees,
 *                           dashed = agent-inferred.
 *
 * Desktop adaptation: data getters come from @/data/parity-loader (the
 * Zustand-backed adapter) instead of the webapp's module-global
 * dataLoader. The component additionally subscribes to the analysis
 * store so a newly loaded run re-renders this page — the webapp's
 * `useMemo([], …)` worked there because its data loads exactly once.
 */
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, GitPullRequest, Workflow } from "lucide-react";
import {
  BionicText,
  loadReadingAid,
  saveReadingAid,
} from "@/components/ui/BionicText";
import {
  getChapterById,
  getPrOverview,
  getJourneyRole,
  getPROverlay,
} from "@/data/parity-loader";
import { useAnalysis } from "@/store/use-analysis-store";
import type { Chapter } from "@/types/journey";
import type { PrOverviewLink } from "@/types/intent";

interface Props {
  chapter: Chapter;
  /** Drill-in from the hub card: the overview is the navigation ROOT —
   *  "Business flow" / "Call graph" live on the card, not in a top tab
   *  strip. Absent (e.g. when rendered outside ChapterView) the
   *  actions are hidden. */
  onOpenView?: (view: "bpmn" | "flow") => void;
  /** When embedded in an outer scroll container (the overview is the page
   *  landing, with the business-flow section below it), flow at natural
   *  height instead of owning a full-height internal scroll — otherwise
   *  the nested scroll traps the wheel and the section below is unreachable. */
  embedded?: boolean;
}

const ROLE_STYLE: Record<string, { label: string; color: string; dim: string }> = {
  core:       { label: "core",       color: "#2e7d5b", dim: "rgba(46,125,91,0.10)" },
  supporting: { label: "supporting", color: "#1d6f8f", dim: "rgba(29,111,143,0.10)" },
  ripple:     { label: "ripple",     color: "#8b8579", dim: "rgba(139,133,121,0.12)" },
};

const STATUS_COLOR: Record<string, string> = {
  added: "#2e7d5b", affected: "#9a6217", removed: "#b04a52", demoted: "#8b8579",
};

function RoleChip({ role }: { role?: string | null }) {
  const s = ROLE_STYLE[role ?? ""] ?? null;
  if (!s) return null;
  return (
    <span
      className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-sm flex-shrink-0"
      style={{ color: s.color, background: s.dim, border: `1px solid ${s.color}40`, letterSpacing: 1.2 }}
    >
      {s.label}
    </span>
  );
}

function StatusChip({ status }: { status?: string | null }) {
  if (!status) return null;
  const c = STATUS_COLOR[status] ?? "#8b8579";
  return (
    <span
      className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-sm flex-shrink-0"
      style={{ color: c, border: `1px solid ${c}40`, letterSpacing: 1.2 }}
    >
      {status}
    </span>
  );
}

/** One neighboring journey: how it connects to the current one + what it does. */
interface Neighbor {
  id: string;
  title: string;
  slug: string | null;
  role: string | null;
  why: string | null;
  prStatus: string | null;
  links: PrOverviewLink[];   // links between current and this journey
  inferredOnly: boolean;
}

export const JourneyOverview: React.FC<Props> = ({ chapter, onOpenView, embedded }) => {
  const navigate = useNavigate();
  // Subscribe so a freshly loaded run re-renders this page; the getters
  // below read the same snapshot through the parity-loader.
  const transformedData = useAnalysis((s) => s.transformedData);
  const overlay = useMemo(() => getPROverlay(), [transformedData]);
  const prOverview = useMemo(() => getPrOverview(), [transformedData]);
  const role = useMemo(() => getJourneyRole(chapter.id), [chapter.id, transformedData]);
  // Reading aid (bionic fixation anchors) — strictly OPT-IN: controlled
  // studies find no average speed gain, but individual readers report
  // less tracking fatigue on text-dense pages like this. Persisted.
  const [readingAid, setReadingAid] = useState<boolean>(loadReadingAid);
  const toggleReadingAid = () => setReadingAid(v => { saveReadingAid(!v); return !v; });

  // ── Neighbors: journeys linked to the CURRENT one (local context). ──
  const { neighbors, unconnected } = useMemo(() => {
    if (!prOverview) return { neighbors: [] as Neighbor[], unconnected: [] };
    const mine = (prOverview.links ?? []).filter(
      l => l.from === chapter.id || l.to === chapter.id,
    );
    const byOther = new Map<string, PrOverviewLink[]>();
    for (const l of mine) {
      const other = l.from === chapter.id ? l.to : l.from;
      if (!byOther.has(other)) byOther.set(other, []);
      byOther.get(other)!.push(l);
    }
    const roleRank: Record<string, number> = { core: 0, supporting: 1, ripple: 2 };
    const neighbors: Neighbor[] = [...byOther.entries()]
      .map(([id, links]) => {
        const ch = getChapterById(id);
        const r = prOverview.journeys.find(j => j.id === id);
        return {
          id,
          title: ch?.title ?? id.split(".").slice(-2).join("."),
          slug: ch?.slug ?? null,
          role: r?.role ?? null,
          why: r?.why ?? null,
          prStatus: ch?.prStatus ?? null,
          links: links.sort((a, b) => Number(!!a.inferred) - Number(!!b.inferred)),
          inferredOnly: links.every(l => l.inferred),
        };
      })
      .sort(
        (a, b) =>
          Number(a.inferredOnly) - Number(b.inferredOnly) ||
          (roleRank[a.role ?? ""] ?? 3) - (roleRank[b.role ?? ""] ?? 3) ||
          a.title.localeCompare(b.title),
      );
    const connectedIds = new Set([chapter.id, ...byOther.keys()]);
    const unconnected = prOverview.journeys
      .filter(j => !connectedIds.has(j.id))
      .map(j => {
        const ch = getChapterById(j.id);
        return { id: j.id, title: ch?.title ?? j.id, slug: ch?.slug ?? null, role: j.role };
      });
    return { neighbors, unconnected };
  }, [prOverview, chapter.id]);

  // ── Connector geometry: hub card center → each neighbor card center,
  //    drawn in the 48px gutter between the two columns. Measured after
  //    layout; remeasured on resize. ──
  const gridRef = useRef<HTMLDivElement | null>(null);
  const hubRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const [wires, setWires] = useState<{ hubY: number; ys: { id: string; y: number; inferred: boolean }[]; h: number }>(
    { hubY: 0, ys: [], h: 0 },
  );

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const gr = grid.getBoundingClientRect();
      const hub = hubRef.current?.getBoundingClientRect();
      if (!hub) return;
      const ys = neighbors
        .map(n => {
          const el = cardRefs.current.get(n.id);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { id: n.id, y: r.top - gr.top + r.height / 2, inferred: n.inferredOnly };
        })
        .filter((x): x is { id: string; y: number; inferred: boolean } => x !== null);
      setWires({ hubY: hub.top - gr.top + hub.height / 2, ys, h: gr.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    return () => ro.disconnect();
  }, [neighbors]);

  const GUTTER = 48;

  return (
    <div className={`bpmn-canvas-root ${embedded ? "" : "h-full overflow-y-auto"}`} style={{ background: "var(--bpmn-bg)" }}>
      <div className="max-w-[1080px] mx-auto px-8 py-8 space-y-10">

        {/* 1 ── THE PR */}
        <section className="rail-section-enter">
          <div className="flex items-baseline gap-2.5 mb-3">
            <GitPullRequest size={12} style={{ color: "var(--bpmn-text-dim)" }} />
            <span className="text-[9px] font-mono uppercase" style={{ color: "var(--bpmn-text-dim)", letterSpacing: 2.2 }}>
              the pull request
            </span>
            {overlay?.id && (
              <span className="text-[10px] font-mono" style={{ color: "var(--bpmn-text-muted)" }}>
                {overlay.headRepo ? `${overlay.headRepo} · ` : ""}{overlay.id}
              </span>
            )}
            <span className="flex-1" />
            {/* Reading aid — fixation-anchor (bionic) rendering for the
                page's prose. Opt-in: evidence shows no average speed gain,
                some readers find tracking easier. Labeled, never icon-only. */}
            <button
              onClick={toggleReadingAid}
              aria-pressed={readingAid}
              title="Bold the start of each word as a fixation anchor. No proven speed gain — some readers find dense text easier to track. Personal preference, persisted."
              className="text-[9px] font-mono uppercase px-2 py-1 rounded-md border transition-colors"
              style={{
                letterSpacing: 1.2,
                color: readingAid ? "var(--bpmn-bg)" : "var(--bpmn-text-muted)",
                background: readingAid ? "var(--bpmn-mint)" : "transparent",
                borderColor: readingAid ? "var(--bpmn-mint)" : "var(--bpmn-border)",
              }}
            >
              <b>fo</b>cus reading {readingAid ? "on" : "off"}
            </button>
          </div>
          {overlay?.title && (
            <h1
              style={{
                fontFamily: "var(--bpmn-font-display)",
                fontStyle: "italic",
                fontSize: 22,
                lineHeight: 1.35,
                color: "var(--bpmn-text)",
              }}
            >
              {overlay.title}
            </h1>
          )}
          {prOverview?.prNarrative && (
            <p className="mt-3 prose-read">
              <BionicText text={prOverview.prNarrative} enabled={readingAid} />
            </p>
          )}
        </section>

        {/* 2 ── THE HUB: this journey + how its neighbors relate */}
        <section className="rail-section-enter">
          <div className="flex items-baseline gap-2.5 mb-3">
            <span className="text-[9px] font-mono uppercase" style={{ color: "var(--bpmn-text-dim)", letterSpacing: 2.2 }}>
              this journey in the PR
            </span>
            {neighbors.length > 0 && (
              <span className="text-[9px] font-mono" style={{ color: "var(--bpmn-text-dim)" }}>
                solid = verified from call trees · dashed = agent-inferred
              </span>
            )}
          </div>

          <div
            ref={gridRef}
            className="relative grid items-start"
            style={{
              gridTemplateColumns: neighbors.length > 0 ? `minmax(0,5fr) ${GUTTER}px minmax(0,6fr)` : "1fr",
            }}
          >
            {/* HUB — the current journey */}
            <div>
              <div
                ref={hubRef}
                className="rounded-lg p-5"
                style={{
                  background: "linear-gradient(180deg, var(--bpmn-surface) 0%, var(--bpmn-surface-soft) 100%)",
                  border: "1px solid color-mix(in srgb, var(--bpmn-mint) 35%, var(--bpmn-border))",
                  boxShadow: "0 1px 3px rgb(60 50 30 / 0.07), 0 14px 34px rgb(60 50 30 / 0.10)",
                }}
              >
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: chapter.color }} />
                  <RoleChip role={role?.role} />
                  <StatusChip status={chapter.prStatus} />
                </div>
                <h2
                  style={{
                    fontFamily: "var(--bpmn-font-display)",
                    fontStyle: "italic",
                    fontSize: 18,
                    lineHeight: 1.35,
                    color: "var(--bpmn-text)",
                  }}
                >
                  {chapter.title}
                </h2>
                {(role?.why || chapter.intentWhy) && (
                  <p className="mt-2.5 prose-read" style={{ fontSize: 14 }}>
                    <BionicText text={(role?.why ?? chapter.intentWhy)!} enabled={readingAid} />
                  </p>
                )}
                {chapter.summary && (
                  <p className="mt-2 prose-read-sm">
                    <BionicText text={chapter.summary} enabled={readingAid} />
                  </p>
                )}
                {/* DRILL-IN — the hierarchy starts on this card. Look
                    deeper = business flow (what it does, step by step);
                    code map = call graph (how the code hangs together). */}
                {onOpenView && (
                  <div className="mt-4 flex items-center gap-2 flex-wrap">
                    {chapter.bpmn && (
                      <button
                        onClick={() => onOpenView("bpmn")}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono transition-colors"
                        style={{
                          border: "1px solid color-mix(in srgb, var(--bpmn-mint) 45%, transparent)",
                          background: "color-mix(in srgb, var(--bpmn-mint) 10%, transparent)",
                          color: "var(--bpmn-mint)",
                        }}
                        title="Step through what this journey does, in business terms — each step lists the functions implementing it"
                      >
                        <Workflow className="w-3.5 h-3.5" />
                        look deeper — business flow
                      </button>
                    )}
                    <button
                      onClick={() => onOpenView("flow")}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono transition-colors"
                      style={{
                        border: "1px solid var(--bpmn-border-em)",
                        background: "var(--bpmn-surface)",
                        color: "var(--bpmn-text-muted)",
                      }}
                      title="The code map — every call this journey makes, with source"
                      onMouseEnter={e => { e.currentTarget.style.color = "var(--bpmn-text)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "var(--bpmn-text-muted)"; }}
                    >
                      <span aria-hidden className="text-[12px] leading-none">⌁</span>
                      code map — call graph
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* GUTTER — connectors from hub to each neighbor card */}
            {neighbors.length > 0 && (
              <svg
                width={GUTTER}
                height={Math.max(wires.h, 1)}
                className="pointer-events-none"
                style={{ gridColumn: 2, gridRow: 1, alignSelf: "stretch", height: "100%" }}
                aria-hidden
              >
                {wires.ys.map(w => (
                  <path
                    key={w.id}
                    d={`M 0 ${wires.hubY} C ${GUTTER * 0.55} ${wires.hubY}, ${GUTTER * 0.45} ${w.y}, ${GUTTER} ${w.y}`}
                    fill="none"
                    stroke={w.inferred ? "rgba(29,111,143,0.5)" : "rgba(46,125,91,0.55)"}
                    strokeWidth={1.4}
                    strokeDasharray={w.inferred ? "5 4" : undefined}
                  />
                ))}
              </svg>
            )}

            {/* NEIGHBORS — what each connected journey does + the relation */}
            {neighbors.length > 0 && (
              <div className="space-y-3">
                {neighbors.map(n => {
                  const primary = n.links[0];
                  return (
                    <div
                      key={n.id}
                      ref={el => { if (el) cardRefs.current.set(n.id, el); else cardRefs.current.delete(n.id); }}
                      role={n.slug ? "link" : undefined}
                      tabIndex={n.slug ? 0 : -1}
                      onClick={() => n.slug && navigate(`/journeys/${encodeURIComponent(n.slug)}`)}
                      onKeyDown={e => { if (e.key === "Enter" && n.slug) navigate(`/journeys/${encodeURIComponent(n.slug)}`); }}
                      className="group rounded-lg p-4 transition-colors"
                      style={{
                        background: "var(--bpmn-surface)",
                        border: "1px solid var(--bpmn-border-soft)",
                        cursor: n.slug ? "pointer" : "default",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--bpmn-border-em)"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--bpmn-border-soft)"; }}
                    >
                      {/* the relation — the headline of this block */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-[11px] font-mono font-semibold"
                          style={{ color: n.inferredOnly ? "var(--bpmn-cyan)" : "var(--bpmn-mint)", letterSpacing: 0.3 }}
                        >
                          {primary?.label ?? "connected"}
                        </span>
                        {primary?.inferred && (
                          <span
                            className="text-[8px] font-mono uppercase px-1 py-px rounded-sm"
                            style={{ color: "var(--bpmn-amber)", border: "1px solid color-mix(in srgb, var(--bpmn-amber) 40%, transparent)", letterSpacing: 1 }}
                            title="Semantic connection inferred by the overview agent — not directly verified from the call trees"
                          >
                            inferred
                          </span>
                        )}
                        {n.links.length > 1 && (
                          <span className="text-[9px] font-mono" style={{ color: "var(--bpmn-text-dim)" }}>
                            +{n.links.length - 1} more
                          </span>
                        )}
                      </div>
                      {primary?.explanation && (
                        <p className="mt-1.5 prose-read-sm">
                          <BionicText text={primary.explanation} enabled={readingAid} />
                        </p>
                      )}

                      {/* the journey itself */}
                      <div className="mt-3 pt-3 flex items-start gap-2" style={{ borderTop: "1px solid var(--bpmn-border-soft)" }}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[12px] font-mono font-medium truncate" style={{ color: "var(--bpmn-text)" }}>
                              {n.title}
                            </span>
                            <RoleChip role={n.role} />
                            <StatusChip status={n.prStatus} />
                          </div>
                          {n.why && (
                            <p className="mt-1 prose-read-sm" style={{ fontSize: 12.5 }}>
                              <BionicText text={n.why} enabled={readingAid} />
                            </p>
                          )}
                        </div>
                        {n.slug && (
                          <ArrowUpRight
                            size={13}
                            className="flex-shrink-0 mt-0.5 transition-colors"
                            style={{ color: "var(--bpmn-text-dim)" }}
                          />
                        )}
                      </div>

                      {/* per-card drill-ins — straight to that journey's
                          flow / call graph (card click = its overview) */}
                      {n.slug && (
                        <div className="mt-2.5 flex items-center gap-1.5">
                          {getChapterById(n.id)?.bpmn && (
                            <button
                              onClick={e => { e.stopPropagation(); navigate(`/journeys/${encodeURIComponent(n.slug!)}?view=bpmn`); }}
                              className="flex items-center gap-1 px-2 py-0.5 rounded text-[9.5px] font-mono transition-colors"
                              style={{ color: "var(--bpmn-mint)", border: "1px solid color-mix(in srgb, var(--bpmn-mint) 30%, transparent)" }}
                              title="Open this journey's business flow directly"
                            >
                              <Workflow className="w-2.5 h-2.5" />
                              flow
                            </button>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); navigate(`/journeys/${encodeURIComponent(n.slug!)}?view=flow`); }}
                            className="flex items-center gap-1 px-2 py-0.5 rounded text-[9.5px] font-mono transition-colors"
                            style={{ color: "var(--bpmn-text-dim)", border: "1px solid var(--bpmn-border-soft)" }}
                            title="Open this journey's call graph directly"
                            onMouseEnter={e => { e.currentTarget.style.color = "var(--bpmn-text)"; }}
                            onMouseLeave={e => { e.currentTarget.style.color = "var(--bpmn-text-dim)"; }}
                          >
                            <span aria-hidden className="text-[10px] leading-none">⌁</span>
                            call graph
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* journeys in the PR with no connection to this one — context chips */}
          {unconnected.length > 0 && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-mono uppercase" style={{ color: "var(--bpmn-text-dim)", letterSpacing: 1.6 }}>
                also in this PR, not connected here:
              </span>
              {unconnected.map(u => (
                <button
                  key={u.id}
                  onClick={() => u.slug && navigate(`/journeys/${encodeURIComponent(u.slug)}`)}
                  className="text-[10px] font-mono px-2 py-0.5 rounded-full transition-colors"
                  style={{ color: "var(--bpmn-text-muted)", border: "1px solid var(--bpmn-border-soft)" }}
                  onMouseEnter={e => { e.currentTarget.style.color = "var(--bpmn-text)"; e.currentTarget.style.borderColor = "var(--bpmn-border-em)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "var(--bpmn-text-muted)"; e.currentTarget.style.borderColor = "var(--bpmn-border-soft)"; }}
                >
                  {u.title}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default JourneyOverview;

/**
 * JourneyIntro — orientation BEFORE the diagram (founder: "the description
 * of the journey and the connection should come at the top; below, the
 * BPMN diagram").
 *
 * Reading order: eyebrow + badges, the journey title, what it does (serif
 * prose: the PR-role rationale, then the narrative summary), then a tight
 * CONNECTS-TO list — one line per related journey naming HOW it relates
 * (solid mint = verified from call trees, cyan + "inferred" = agent).
 * Every part renders only when its data exists; absence collapses — there
 * is never an empty box.
 */
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Workflow } from "lucide-react";
import {
  getChapterById,
  getJourneyRole,
  getPrOverview,
} from "@/data/parity-loader";
import { useAnalysis } from "@/store/use-analysis-store";
import type { Chapter } from "@/types/journey";
import type { PrOverviewLink } from "@/types/intent";

const MAX_VISIBLE_CONNECTIONS = 4;

interface Neighbor {
  id: string;
  title: string;
  slug: string | null;
  prStatus: string | null;
  label: string;
  explanation: string | null;
  inferred: boolean;
  extra: number; // additional links beyond the primary one
}

interface Props {
  chapter: Chapter;
  /** Status chips owned by the page (PR badge etc.) — rendered at the
   *  right end of the eyebrow row. */
  badges?: React.ReactNode;
}

export const JourneyIntro: React.FC<Props> = ({ chapter, badges }) => {
  const navigate = useNavigate();
  // Subscribe so a freshly loaded run re-renders; the getters read the
  // same snapshot through the parity-loader.
  const transformedData = useAnalysis((s) => s.transformedData);
  const prOverview = useMemo(() => getPrOverview(), [transformedData]);
  const role = useMemo(
    () => getJourneyRole(chapter.id),
    [chapter.id, transformedData]
  );
  const [showAll, setShowAll] = useState(false);

  const neighbors = useMemo<Neighbor[]>(() => {
    if (!prOverview) return [];
    const mine = (prOverview.links ?? []).filter(
      (l) => l.from === chapter.id || l.to === chapter.id
    );
    const byOther = new Map<string, PrOverviewLink[]>();
    for (const l of mine) {
      const other = l.from === chapter.id ? l.to : l.from;
      if (!byOther.has(other)) byOther.set(other, []);
      byOther.get(other)!.push(l);
    }
    return [...byOther.entries()]
      .map(([id, links]) => {
        const sorted = links.sort(
          (a, b) => Number(!!a.inferred) - Number(!!b.inferred)
        );
        const primary = sorted[0];
        const ch = getChapterById(id);
        return {
          id,
          title: ch?.title ?? id.split(".").slice(-2).join("."),
          slug: ch?.slug ?? null,
          prStatus: ch?.prStatus ?? null,
          label: primary?.label ?? "connected",
          explanation: primary?.explanation ?? null,
          inferred: sorted.every((l) => l.inferred),
          extra: sorted.length - 1,
        };
      })
      .sort(
        (a, b) =>
          Number(a.inferred) - Number(b.inferred) ||
          a.title.localeCompare(b.title)
      );
  }, [prOverview, chapter.id]);

  const why = role?.why ?? chapter.intentWhy ?? null;
  const visible = showAll
    ? neighbors
    : neighbors.slice(0, MAX_VISIBLE_CONNECTIONS);

  return (
    <section className="pt-5 pb-5">
      {/* eyebrow row */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Workflow className="h-3 w-3" style={{ color: "var(--bpmn-mint)" }} />
        <span
          className="font-mono text-[9.5px] uppercase"
          style={{ color: "var(--bpmn-mint)", letterSpacing: 3 }}
        >
          journey
        </span>
        <span className="flex-1" />
        {badges}
      </div>

      {/* the journey, named */}
      <h1
        className="m-0 max-w-[46ch]"
        style={{
          fontFamily: "var(--bpmn-font-display)",
          fontStyle: "italic",
          fontSize: 22,
          lineHeight: 1.3,
          letterSpacing: 0.2,
          color: "var(--bpmn-text)",
        }}
      >
        {chapter.title}
      </h1>

      {/* what it does — full description, top of the page by design */}
      {why && (
        <p className="prose-read mt-3 max-w-[78ch]" style={{ fontSize: 14 }}>
          {why}
        </p>
      )}
      {chapter.summary && (
        <p className="prose-read-sm mt-2 max-w-[78ch]">{chapter.summary}</p>
      )}

      {/* the connections — how this journey ties into the others */}
      {neighbors.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-baseline gap-2.5">
            <span
              className="font-mono text-[9px] uppercase"
              style={{ color: "var(--bpmn-text-dim)", letterSpacing: 2.2 }}
            >
              connects to
            </span>
            <span
              className="font-mono text-[9px]"
              style={{ color: "var(--bpmn-text-dim)" }}
            >
              mint = verified from call trees · cyan = agent-inferred
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {visible.map((n) => (
              <button
                key={n.id}
                type="button"
                disabled={!n.slug}
                onClick={() =>
                  n.slug && navigate(`/journeys/${encodeURIComponent(n.slug)}`)
                }
                title={n.explanation ?? undefined}
                className="group flex w-full items-baseline gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors"
                style={{
                  border: "1px solid transparent",
                  cursor: n.slug ? "pointer" : "default",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bpmn-surface)";
                  e.currentTarget.style.borderColor = "var(--bpmn-border-soft)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor = "transparent";
                }}
              >
                <span
                  className="shrink-0 font-mono text-[10.5px] font-semibold"
                  style={{
                    color: n.inferred ? "var(--bpmn-cyan)" : "var(--bpmn-mint)",
                    letterSpacing: 0.3,
                  }}
                >
                  {n.label}
                  {n.extra > 0 && (
                    <span style={{ color: "var(--bpmn-text-dim)" }}>
                      {" "}
                      +{n.extra}
                    </span>
                  )}
                </span>
                <span
                  aria-hidden
                  className="shrink-0 font-mono text-[10px]"
                  style={{ color: "var(--bpmn-text-dim)" }}
                >
                  →
                </span>
                <span
                  className="shrink-0 font-mono text-[12px] font-medium"
                  style={{ color: "var(--bpmn-text)" }}
                >
                  {n.title}
                </span>
                {n.inferred && (
                  <span
                    className="shrink-0 rounded-sm px-1 py-px font-mono text-[8px] uppercase"
                    style={{
                      color: "var(--bpmn-amber)",
                      border:
                        "1px solid color-mix(in srgb, var(--bpmn-amber) 40%, transparent)",
                      letterSpacing: 1,
                    }}
                    title="Semantic connection inferred by the overview agent — not directly verified from the call trees"
                  >
                    inferred
                  </span>
                )}
                {n.explanation && (
                  <span
                    className="min-w-0 flex-1 truncate text-[11.5px]"
                    style={{ color: "var(--bpmn-text-muted)" }}
                  >
                    {n.explanation}
                  </span>
                )}
                {n.slug && (
                  <ArrowUpRight
                    size={12}
                    className="shrink-0 self-center opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ color: "var(--bpmn-text-dim)" }}
                  />
                )}
              </button>
            ))}
          </div>
          {neighbors.length > MAX_VISIBLE_CONNECTIONS && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-1.5 px-2.5 font-mono text-[10px] underline decoration-dotted underline-offset-2"
              style={{ color: "var(--bpmn-text-dim)" }}
            >
              {showAll
                ? "show fewer"
                : `+${neighbors.length - MAX_VISIBLE_CONNECTIONS} more connections`}
            </button>
          )}
        </div>
      )}
    </section>
  );
};

export default JourneyIntro;

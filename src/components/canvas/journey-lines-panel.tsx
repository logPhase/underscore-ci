import { deriveJourneyRoute } from "@/lib/canvas/journey-route";
import { impactRank } from "@/lib/transform-data/utils";
import { useAnalysis } from "@/store/use-analysis-store";
import { useJourneyStore } from "@/store/use-journey-store";
import type { JourneyData } from "@/store/use-journey-store";
import { useUIStore } from "@/store/use-ui-store";
import type { ChapterPRStatus } from "@/types/journey";
import { Route, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LINE_COLORS } from "./sub-components/journey-lines";

// ─── Journey-lines picker ─────────────────────────────────────────────────
// Bottom-left canvas panel (where the old Journeys FAB was). Lists the run's
// journeys; clicking one lights its transit line on the map (max 3, FIFO via
// the store). In PR mode the impacted journeys sort first and the first few
// auto-light — "PR at a glance". A `?lines=<id,id>` deep link pre-lights a
// specific set (shareable link to a lit canvas), which the visual check uses.

/** Parse the `lines` query param from both the pre-hash search string and the
 *  hash route query (HashRouter puts `?lines=…` after the `#/canvas`). */
function readLinesParam(): string[] {
  const out: string[] = [];
  const collect = (qs: string) => {
    const v = new URLSearchParams(qs).get("lines");
    if (v) out.push(...v.split(",").map((s) => s.trim()).filter(Boolean));
  };
  collect(window.location.search.replace(/^\?/, ""));
  const hash = window.location.hash;
  const qi = hash.indexOf("?");
  if (qi >= 0) collect(hash.slice(qi + 1));
  return [...new Set(out)];
}

/** PR impact badge — same status language + tints as the journey index page
 *  (src/pages/journeys.tsx). */
function impactBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case "added":
      return {
        label: "added",
        cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
      };
    case "removed":
      return {
        label: "removed",
        cls: "bg-red-500/15 text-red-300 border-red-500/40",
      };
    case "demoted":
      return {
        label: "demoted",
        cls: "bg-sky-500/15 text-sky-300 border-sky-500/40",
      };
    default:
      return {
        label: "affected",
        cls: "bg-amber-500/15 text-amber-300 border-amber-500/40",
      };
  }
}

export function JourneyLinesPanel() {
  const journeys = useAnalysis((s) => s.transformedData?.journeys);
  const serviceGroups = useAnalysis((s) => s.transformedData?.serviceGroups);
  const services = useAnalysis((s) => s.transformedData?.services);
  const sharedLibs = useAnalysis((s) => s.transformedData?.sharedLibs);
  const fileToComponent = useAnalysis((s) => s.transformedData?.fileToComponent);
  const prMode = useUIStore((s) => s.prMode);
  const activeLineIds = useJourneyStore((s) => s.activeLineIds);
  const toggleLine = useJourneyStore((s) => s.toggleLine);
  const clearLines = useJourneyStore((s) => s.clearLines);
  const navigate = useNavigate();

  // Default COLLAPSED, always. PR mode (and a `?lines=` deep link) still
  // PRE-LIGHTS the transit lines via the init effect below — the collapsed
  // pill shows "N lit" so the state stays visible without the 300px panel
  // covering the map on load.
  const [open, setOpen] = useState(false);

  // Per-journey route length (components) + step count — cheap to precompute
  // once for the whole list; drives the "N cmp · M steps" tag.
  const routeInfo = useMemo(() => {
    const nameById = new Map<string, string>();
    for (const s of services ?? []) nameById.set(s.id, s.name);
    for (const s of sharedLibs ?? []) nameById.set(s.id, s.name);
    const m = new Map<string, { components: number; steps: number }>();
    for (const j of journeys ?? []) {
      const r = deriveJourneyRoute(j, serviceGroups, nameById, fileToComponent);
      m.set(j.id, { components: r.stops.length, steps: j.steps.length });
    }
    return m;
  }, [journeys, serviceGroups, services, sharedLibs, fileToComponent]);

  // Impacted journeys first (stable within a rank — keeps discovery order).
  const sorted = useMemo<JourneyData[]>(() => {
    const list = [...(journeys ?? [])];
    list.sort(
      (a, b) =>
        impactRank(b.prStatus as ChapterPRStatus | undefined) -
        impactRank(a.prStatus as ChapterPRStatus | undefined)
    );
    return list;
  }, [journeys]);

  // Initial light-up: a `?lines=` param wins; otherwise, in PR mode with
  // nothing lit yet, auto-light the first ≤3 impacted journeys.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    if (!journeys || journeys.length === 0) return;
    didInit.current = true;
    const known = new Set(journeys.map((j) => j.id));
    const fromParam = readLinesParam().filter((id) => known.has(id));
    if (fromParam.length > 0) {
      for (const id of fromParam)
        if (!activeLineIds.includes(id)) toggleLine(id);
      return;
    }
    if (prMode && activeLineIds.length === 0) {
      const impacted = sorted.filter(
        (j) => impactRank(j.prStatus as ChapterPRStatus | undefined) > 0
      );
      for (const j of impacted.slice(0, 3)) toggleLine(j.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeys, prMode, sorted]);

  if (!journeys || journeys.length === 0) return null;

  const count = activeLineIds.length;

  const pillStyle: React.CSSProperties = {
    background: "var(--cw-stats-bg)",
    border: "1px solid var(--cw-stats-border)",
    backdropFilter: "blur(8px)",
    color: "var(--cw-stats-text)",
  };

  if (!open) {
    return (
      <div
        className="absolute z-42"
        style={{ bottom: 24, left: 70 }}
        onWheel={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setOpen(true)}
          title="Light journeys as transit lines on the map"
          className="flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-2 font-mono text-xs"
          style={pillStyle}
        >
          <Route className="h-3.5 w-3.5" />
          <span>Journey lines</span>
          {count > 0 && (
            <span
              className="ml-0.5 inline-flex h-4 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold"
              style={{
                background: "hsl(var(--primary))",
                color: "hsl(var(--primary-foreground))",
              }}
            >
              {count} lit
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      className="absolute z-42 flex flex-col overflow-hidden rounded-xl font-mono"
      style={{
        bottom: 24,
        left: 70,
        width: 300,
        maxHeight: "46vh",
        ...pillStyle,
      }}
      // Contain the wheel: scrolling inside the panel must never reach the
      // canvas zoom underneath, and must not chain to the page.
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid var(--cw-stats-border)" }}
      >
        <div className="min-w-0">
          <div
            className="text-[9px] font-semibold tracking-[0.14em] uppercase"
            style={{ color: "var(--bpmn-text-dim)" }}
          >
            Journey lines
          </div>
          <div className="text-[11px]" style={{ color: "var(--bpmn-text-muted)" }}>
            {count} of 3 lit
          </div>
        </div>
        <div className="flex items-center gap-1">
          {count > 0 && (
            <button
              onClick={clearLines}
              className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] transition-colors hover:bg-white/5"
              style={{ color: "var(--bpmn-text-muted)" }}
            >
              clear
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            className="cursor-pointer rounded p-1 transition-colors hover:bg-white/5"
            style={{ color: "var(--bpmn-text-muted)" }}
            title="Collapse"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Journey list */}
      <div
        className="min-h-0 flex-1 overflow-y-auto py-1"
        style={{ overscrollBehavior: "contain" }}
      >
        {sorted.map((j) => {
          const active = activeLineIds.includes(j.id);
          const colorIdx = activeLineIds.indexOf(j.id);
          const dotColor = active
            ? LINE_COLORS[colorIdx % LINE_COLORS.length]
            : undefined;
          const info = routeInfo.get(j.id);
          const badge =
            prMode && j.prStatus ? impactBadge(j.prStatus) : null;
          return (
            <button
              key={j.id}
              onClick={() => toggleLine(j.id)}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
              style={
                active
                  ? { boxShadow: `inset 2px 0 0 0 ${dotColor}` }
                  : undefined
              }
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={
                  active
                    ? { background: dotColor }
                    : { border: "1.5px solid var(--bpmn-text-dim)" }
                }
              />
              <span
                className="min-w-0 flex-1 truncate text-[12px]"
                style={{
                  color: active ? "var(--bpmn-text)" : "var(--bpmn-text-muted)",
                }}
              >
                {j.title}
              </span>
              {badge && (
                <span
                  className={`shrink-0 rounded-sm border px-1 py-0.5 text-[9px] ${badge.cls}`}
                >
                  {badge.label}
                </span>
              )}
              {info && (
                <span
                  className="shrink-0 text-[10px] tabular-nums"
                  style={{ color: "var(--bpmn-text-dim)" }}
                >
                  {info.components} cmp · {info.steps} steps
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div
        className="shrink-0 px-3 py-2"
        style={{ borderTop: "1px solid var(--cw-stats-border)" }}
      >
        <button
          onClick={() => navigate("/journeys")}
          className="cursor-pointer text-[11px] transition-colors hover:underline"
          style={{ color: "var(--bpmn-cyan)" }}
        >
          All journeys →
        </button>
      </div>
    </div>
  );
}

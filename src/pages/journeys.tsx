import { FqnRow, StatusLegend } from "@/components/journeys/journey-index";
import { useUIStore } from "@/store/use-ui-store";
import { Chapter, StatusKey } from "@/types/journey";
import { motion } from "motion/react";
import {
  ArrowLeft,
  ChevronDown,
  Workflow,
  ChevronRight,
  EyeOff,
  GitPullRequest,
  Search,
  Sparkles,
} from "lucide-react";
import {
  Dispatch,
  useEffect,
  useMemo,
  useState,
  SetStateAction,
  useCallback,
} from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAnalysis } from "@/store/use-analysis-store";
import { FilterPill } from "@/components/journeys/filter-pill";
import { Button } from "@/components/ui/button";
import { impactRank } from "@/lib/transform-data/utils";

import PRSummaryBanner from "@/components/canvas/PRSummaryBanner";
import {
  deriveJourneyRoute,
  type JourneyRoute,
} from "@/lib/canvas/journey-route";

/** True when the journey carries a real composed Business-Flow diagram —
 *  the synthetic call-trace fallback doesn't count (every journey has one). */
const hasComposedFlow = (ch: Chapter): boolean =>
  !!ch.bpmn && !(ch.bpmn as { synthetic?: boolean }).synthetic;

/** Tiny mono badge marking diagram-bearing rows on the board. */
const FlowBadge = ({ chapter }: { chapter: Chapter }) =>
  hasComposedFlow(chapter) ? (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9.5px] tracking-wider uppercase"
      style={{
        color: "var(--bpmn-mint)",
        borderColor: "color-mix(in srgb, var(--bpmn-mint) 40%, transparent)",
      }}
      title="Business-flow diagram available"
    >
      <Workflow className="h-3 w-3" />
      flow
    </span>
  ) : null;

// ── Departures board (founder-approved Concept A) ──────────────────────
// Each journey renders as a transit LINE on a service board: a lettered
// line badge in the journey's colour, the title + summary, and the
// signature — the ROUTE STRING: the journey's component stops as mono
// chips joined by dotted coloured segments (the same stops the canvas
// transit lines draw, via deriveJourneyRoute). Amber Δ chips mark stops
// the PR touched.

/** Stable line label: A…Z then numbers, by position in the full list —
 *  the same journey keeps its letter no matter how the board is filtered. */
const lineLabel = (idx: number): string =>
  idx < 26 ? String.fromCharCode(65 + idx) : String(idx + 1);

/** "1 step" / "3 steps" — the board quotes counts everywhere; a bare
 *  "1 components" reads like a bug (54-journey board audit). */
const plural = (n: number, word: string): string =>
  `${n} ${word}${n === 1 ? "" : "s"}`;

const MAX_ROUTE_STOPS = 6;

// Long boards (54 journeys on a whole-repo run): cap the entrance stagger
// so the tail rows don't sit invisible for seconds while their delay burns
// down — past the first dozen rows everything enters together.
const staggerDelay = (i: number, step: number): number =>
  0.08 + Math.min(i, 12) * step;

/** The route string — component stops joined by dotted flow segments. */
const RouteString = ({
  route,
  color,
  showDelta,
}: {
  route: JourneyRoute | undefined;
  color: string;
  showDelta: boolean;
}) => {
  if (!route || route.stops.length === 0) return null;
  const stops = route.stops.slice(0, MAX_ROUTE_STOPS);
  const extra = route.stops.length - stops.length;
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-y-1.5" aria-hidden="true">
      {stops.map((stop, i) => {
        const changed = showDelta && stop.changedSteps > 0;
        return (
          <span key={stop.key} className="flex items-center">
            {i > 0 && <span className="route-seg" style={{ color }} />}
            <span
              className={`rounded-md border px-2 py-[3px] font-mono text-[10px] tracking-wide whitespace-nowrap ${
                changed
                  ? "border-amber-500/55 bg-amber-500/[0.07] text-amber-300"
                  : ""
              }`}
              style={
                changed
                  ? undefined
                  : {
                      // Tokens, not zinc: the paper theme's zinc compat sweep
                      // misses opacity variants, leaving dark chips on cream.
                      borderColor: "var(--bpmn-border-em)",
                      background: "var(--bpmn-bg-deep)",
                      color: "var(--bpmn-text)",
                    }
              }
            >
              {changed && <span className="mr-1">Δ</span>}
              {stop.name}
            </span>
          </span>
        );
      })}
      {extra > 0 && (
        <span className="flex items-center">
          <span className="route-seg" style={{ color }} />
          <span
            className="rounded-md border px-2 py-[3px] font-mono text-[10px]"
            style={{
              borderColor: "var(--bpmn-border)",
              color: "var(--bpmn-text-dim)",
            }}
          >
            +{extra} more
          </span>
        </span>
      )}
    </div>
  );
};

/** The circled line badge — journey colour, dashed amber halo when the PR
 *  touches the line. */
const LineBadge = ({
  label,
  color,
  affected,
}: {
  label: string;
  color: string;
  affected: boolean;
}) => (
  <span className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center">
    {affected && (
      <span
        className="absolute inset-[-7px] rounded-full border-[1.5px] border-dashed border-amber-500/55"
        aria-hidden="true"
      />
    )}
    <span
      className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-[2.5px] font-mono text-[19px] font-bold"
      style={{ borderColor: color, color }}
    >
      {label}
    </span>
  </span>
);

/** Right rail of a board row: component count large, steps/elements small,
 *  Δ-affected pill when the PR touches the line. */
const RowStats = ({
  route,
  chapter,
  affected,
}: {
  route: JourneyRoute | undefined;
  chapter: Chapter;
  affected: boolean;
}) => (
  <div className="hidden shrink-0 text-right font-mono sm:block">
    <div
      className="text-[24px] leading-none font-bold tracking-tight"
      style={{ color: "var(--bpmn-text)" }}
    >
      {route?.stops.length ?? chapter.services.length}
      <span
        className="ml-1 text-[12px] font-medium"
        style={{ color: "var(--bpmn-text-dim)" }}
      >
        {(route?.stops.length ?? chapter.services.length) === 1
          ? "component"
          : "components"}
      </span>
    </div>
    <div className="mt-1.5 text-[11px]" style={{ color: "var(--bpmn-text-dim)" }}>
      {plural(chapter.steps.length, "step")}
      {chapter.bpmn?.elements?.length
        ? ` · ${plural(chapter.bpmn.elements.length, "flow element")}`
        : ""}
    </div>
    {affected && (
      <span className="mt-2 inline-flex items-center rounded-full border border-amber-500/45 bg-amber-500/[0.08] px-2 py-[2px] text-[10px] tracking-wider text-amber-300">
        <span className="mr-1">Δ</span>affected
      </span>
    )}
  </div>
);

const IMPACTED_SET = new Set<StatusKey>([
  "affected",
  "added",
  "removed",
  "demoted",
]);

const ALL_IMPACTED_ACTIVE = ["affected", "added", "removed", "demoted"];

/** Human label for the intent-classifier's `intentReclass` field. The raw
 *  values are kebab-case identifiers picked for the JSON; these are the
 *  strings shown on the card pill. */
const RECLASS_LABEL: Record<NonNullable<Chapter["intentReclass"]>, string> = {
  "decorator-wrap": "decorator wrap",
  scaffolding: "DI wiring",
  "rename-or-move": "renamed",
  "behaviour-change": "behaviour change",
  "true-removal": "true removal",
  "true-addition": "true addition",
};

/** Same auto-title heuristic the PR banner uses: the analyzer emits a
 *  "<branch> → <sha7>" placeholder when no real PR title was available. */
const isAutoPrTitle = (t?: string): boolean =>
  !t || /^[\w/-]+\s*[→→]\s*[a-f0-9]{6,}$/.test(t);

/**
 * PR notice — the "what this PR does" block at the top of the departures
 * board. Violet-anchored serif notice (matching the board's visual language);
 * "What this PR does:" lead-in + the connection-agent narrative. Long
 * narratives collapse with a show-more toggle. Only shown in PR mode with a
 * narrative present; full-repo reports render nothing. The PR *title* lives in
 * the header's PR line, so it isn't repeated here.
 */
const PRIntro = () => {
  const prMode = useUIStore((s) => s.prMode);
  const prOverview = useAnalysis((s) => s.transformedData?.prOverview);
  const [expanded, setExpanded] = useState(false);

  const narrative = prOverview?.prNarrative?.trim();
  if (!prMode || !narrative) return null;

  const long = narrative.length > 300;

  return (
    <motion.div
      className="mt-6 rounded-r-md border-l-[3px] py-3 pr-4 pl-4"
      style={{
        borderColor: "hsl(var(--primary))",
        background:
          "linear-gradient(90deg, color-mix(in srgb, hsl(var(--primary)) 10%, transparent), transparent 72%)",
      }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <p
        className={`text-[14px] leading-relaxed text-zinc-300 ${
          long && !expanded ? "line-clamp-3" : ""
        }`}
        style={{ fontFamily: "var(--reading-font)" }}
      >
        <span className="font-semibold text-zinc-100">What this PR does:</span>{" "}
        {narrative}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 font-mono text-[11px] transition-opacity hover:opacity-80"
          style={{ color: "hsl(var(--primary))" }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </motion.div>
  );
};

interface JourneyHeaderProps {
  onBack: () => void;
  chapters: Chapter[];
  hasPR: boolean;
  impacted: Chapter[];
  activeStatuses: Set<StatusKey>;
  statusCounts: Record<StatusKey | "all", number>;
  setSearchOpen: (open: boolean) => void;
  searchOpen: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  setActiveStatuses: Dispatch<SetStateAction<Set<StatusKey>>>;
}

const JourneyHeader = ({
  onBack,
  chapters,
  hasPR,
  impacted,
  activeStatuses,
  statusCounts,
  setSearchOpen,
  searchOpen,
  searchQuery,
  setSearchQuery,
  setActiveStatuses,
}: JourneyHeaderProps) => {
  const togglePill = (s: StatusKey) =>
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const clearPills = () => setActiveStatuses(new Set());

  const prOverlay = useAnalysis((s) => s.transformedData?.prOverlay);
  const prTitle = isAutoPrTitle(prOverlay?.title) ? null : prOverlay?.title;

  return (
    <div className="mx-auto max-w-3xl px-6 pt-6 pb-3">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Button
          onClick={onBack}
          variant="ghost"
          className="mb-3 gap-1.5 px-2 py-1 text-zinc-500 hover:bg-[color:var(--bpmn-surface-hi)] hover:text-zinc-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Canvas
        </Button>
        {/* Departures identity: mono teal eyebrow + serif-italic headline. */}
        <div
          className="font-mono text-[10.5px] tracking-[0.3em] uppercase"
          style={{ color: "hsl(var(--signal))" }}
        >
          {hasPR ? "Journeys · Departures" : "Journeys"}
        </div>
        <h1
          className="mt-2 mb-1 text-[34px] leading-tight font-medium tracking-tight text-zinc-100"
          style={{ fontFamily: "var(--reading-font)", fontStyle: "italic" }}
        >
          {hasPR
            ? // The headline claims what the CHANGE touches — that's the
              // impacted count, not the whole codebase's journey total
              // ("121 lines run through this change" on a 28-line PR lies).
              `${impacted.length} line${impacted.length === 1 ? "" : "s"} run through this change.`
            : `${chapters.length} journey${chapters.length === 1 ? "" : "s"} through the codebase.`}
        </h1>
        {hasPR ? (
          <div className="mt-2 flex flex-wrap items-center gap-2.5 font-mono text-[12px] text-zinc-400">
            {impacted.length > 0 && (
              <button
                onClick={() => {
                  const allImpactedActive = ALL_IMPACTED_ACTIVE.every((s) =>
                    activeStatuses.has(s as StatusKey)
                  );
                  setActiveStatuses(
                    allImpactedActive ? new Set() : IMPACTED_SET
                  );
                }}
                title="Filter to PR-impacted journeys only"
                className="rounded-full border border-amber-500/45 bg-amber-500/10 px-2.5 py-[2.5px] text-[10.5px] text-amber-300 transition-colors hover:bg-amber-500/20"
              >
                PR · {plural(impacted.length, "line")} affected
              </button>
            )}
            {prTitle && (
              <span className="min-w-0 truncate text-zinc-400" title={prTitle}>
                {prTitle}
              </span>
            )}
          </div>
        ) : (
          <p className="mt-1.5 text-sm text-zinc-500">
            {chapters.length} execution paths through the codebase.
          </p>
        )}
      </motion.div>

      {/* PR narrative — "what this PR does", at the top of the listing */}
      <PRIntro />

      {/* Search */}
      <motion.div
        className="mt-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
      >
        <div
          className="flex cursor-text items-center gap-3 rounded-lg border px-4 py-2.5 transition-colors"
          style={{
            borderColor: "var(--bpmn-border-soft)",
            background: "var(--bpmn-surface-soft)",
          }}
          onClick={() => setSearchOpen(true)}
        >
          <Search className="h-4 w-4 text-zinc-500" />
          {searchOpen ? (
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onBlur={() => {
                if (!searchQuery) setSearchOpen(false);
              }}
              placeholder="Search journeys, functions, services..."
              className="flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
            />
          ) : (
            <span className="flex-1 text-sm text-zinc-600">
              Search journeys...
            </span>
          )}
          {/* Cmd+K belongs to the command palette now — no shortcut hint */}
        </div>
      </motion.div>

      {/* Status filter pills — only when PR overlay is active */}
      {hasPR && (
        <motion.div
          className="mt-3 flex flex-wrap items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <FilterPill
            label="All"
            count={statusCounts.all}
            active={activeStatuses.size === 0}
            onClick={clearPills}
            variant="all"
          />
          <FilterPill
            label="Affected"
            count={statusCounts.affected}
            active={activeStatuses.has("affected")}
            onClick={() => togglePill("affected")}
            variant="affected"
          />
          <FilterPill
            label="Added"
            count={statusCounts.added}
            active={activeStatuses.has("added")}
            onClick={() => togglePill("added")}
            variant="added"
          />
          <FilterPill
            label="Removed"
            count={statusCounts.removed}
            active={activeStatuses.has("removed")}
            onClick={() => togglePill("removed")}
            variant="removed"
          />
          <FilterPill
            label="Demoted"
            count={statusCounts.demoted}
            active={activeStatuses.has("demoted")}
            onClick={() => togglePill("demoted")}
            variant="demoted"
          />
          <FilterPill
            label="Unchanged"
            count={statusCounts.unchanged}
            active={activeStatuses.has("unchanged")}
            onClick={() => togglePill("unchanged")}
            variant="unchanged"
          />
          <StatusLegend />
        </motion.div>
      )}
    </div>
  );
};

const JourneyPage = () => {
  const allChapters = useAnalysis((state) => state.transformedData?.chapters);
  const transformedData = useAnalysis((state) => state.transformedData);

  const prMode = useUIStore((state) => state.prMode);

  // Component routes for every journey, derived ONCE — the same
  // deriveJourneyRoute the canvas transit lines use, so the board's route
  // strings are the map's stops, not decoration. Keyed by journey/chapter id.
  const routesById = useMemo(() => {
    const m = new Map<string, JourneyRoute>();
    if (!transformedData) return m;
    const nameById = new Map(
      transformedData.services.map((s) => [s.id, s.name])
    );
    for (const j of transformedData.journeys) {
      m.set(
        j.id,
        deriveJourneyRoute(
          j,
          transformedData.serviceGroups,
          nameById,
          transformedData.fileToComponent
        )
      );
    }
    return m;
  }, [transformedData]);

  // Stable line labels by position in the FULL chapter list.
  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    (allChapters ?? []).forEach((ch, i) => m.set(ch.id, lineLabel(i)));
    return m;
  }, [allChapters]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeStatuses, setActiveStatuses] = useState<Set<StatusKey>>(
    new Set()
  );

  // When PR mode is off, hide "removed" and "demoted" journeys — neither is
  // a top-level entry point at HEAD, so they would mislead a non-PR viewer.
  const chapters = useMemo(() => {
    // No analysis loaded yet → empty list, never a crash (live-test
    // finding: undefined.filter unmounted the whole React tree).
    const all = allChapters ?? [];
    const visible = prMode
      ? all
      : all.filter(
          (ch) => ch.prStatus !== "removed" && ch.prStatus !== "demoted"
        );
    // Founder: the board lists ONLY the agent-composed journeys (the ones
    // carrying a real business-flow diagram). Raw call-graph traces stay
    // reachable — canvas lines and chapter connections deep-link into them —
    // but never as board rows. Structural-only reports (zero composed) keep
    // the full raw board so non-enriched clients still get a working list.
    const composed = visible.filter(hasComposedFlow);
    return composed.length > 0 ? composed : visible;
  }, [allChapters, prMode]);

  // PR mode is driven entirely by per-chapter prStatus now — prOverlay only
  // provides file-level summary stats.
  const hasPR = useMemo(
    () => prMode && chapters.some((ch) => ch.prStatus),
    [chapters, prMode]
  );

  const navigate = useNavigate();
  const onBack = useCallback(() => navigate("/home"), [navigate]);
  const onSelectChapter = (id: string) =>
    navigate(`/journeys/${encodeURIComponent(id)}`);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+K belongs to the global command palette (command-palette.tsx);
      // chapter search opens via the index toolbar button.
      if (e.key === "Escape") {
        if (searchOpen) {
          setSearchOpen(false);
          setSearchQuery("");
        } else {
          onBack();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchOpen, onBack]);

  const { impacted, primary, secondary, noise, unimpacted, statusCounts, hasIntent } =
    useMemo(() => {
      let result = chapters;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        result = result.filter(
          (ch) =>
            ch.title.toLowerCase().includes(q) ||
            ch.summary.toLowerCase().includes(q) ||
            ch.services.some((s) => s.toLowerCase().includes(q)) ||
            ch.functions.some((f) => f.toLowerCase().includes(q))
        );
      }
      // Counts reflect post-search totals so pills show what user *would* see
      // if they clicked them, regardless of which other pills are active.
      const counts = {
        all: result.length,
        affected: 0,
        added: 0,
        removed: 0,
        demoted: 0,
        unchanged: 0,
      };
      for (const ch of result) {
        const k = (ch.prStatus ?? "unchanged") as StatusKey;
        counts[k]++;
      }
      const filtered =
        activeStatuses.size === 0
          ? result
          : result.filter((ch) =>
              activeStatuses.has((ch.prStatus ?? "unchanged") as StatusKey)
            );
      if (!hasPR)
        return {
          impacted: [],
          primary: [],
          secondary: [],
          noise: [],
          unimpacted: filtered,
          statusCounts: counts,
          hasIntent: false,
        };
      const imp = filtered
        .filter((ch) => impactRank(ch.prStatus) > 0)
        .sort(
          (a, b) =>
            impactRank(b.prStatus) - impactRank(a.prStatus) ||
            // Composed/diagrammed journeys lead within a rank — they're the
            // richest reading and carry the "flow" badge.
            Number(hasComposedFlow(b)) - Number(hasComposedFlow(a))
        );
      const unimp = filtered.filter((ch) => impactRank(ch.prStatus) === 0);
      // Intent-classifier output (optional). Buckets the impacted set into
      // `primary` (directly implements the PR), `secondary` (supporting
      // decorator-wrap / scaffolding), `noise` (structurally flagged but
      // semantically inert). When no journey carries intentCategory we
      // hide the buckets and render the flat impacted list as before.
      const hasIntent = imp.some((ch) => ch.intentCategory);
      const prim = hasIntent
        ? imp.filter((ch) => ch.intentCategory === "primary")
        : [];
      const sec = hasIntent
        ? imp.filter((ch) => ch.intentCategory === "secondary")
        : [];
      const noi = hasIntent
        ? imp.filter((ch) => ch.intentCategory === "noise")
        : [];
      return {
        impacted: imp,
        primary: prim,
        secondary: sec,
        noise: noi,
        unimpacted: unimp,
        statusCounts: counts,
        hasIntent,
      };
    }, [chapters, searchQuery, hasPR, activeStatuses]);

  const [showNoise, setShowNoise] = useState(false);

  // The board lists ONLY the agent-composed journeys — `chapters` is already
  // that set (see the memo above; raw traces appear only in the structural-
  // only fallback). No fold, no second tier: what the agent emitted is the
  // whole reading.
  const renderQuietRow = (chapter: Chapter, i: number, aff: boolean) => (
    <motion.div
      key={chapter.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: staggerDelay(i, 0.05) }}
      onClick={() => onSelectChapter(chapter.slug)}
      className="group journey-card-quiet cursor-pointer rounded-lg border p-4 transition-all duration-200 hover:-translate-y-0.5"
      data-tour="journey-row"
      data-chapter-slug={chapter.slug}
    >
      <div className="flex items-center gap-5">
        <LineBadge
          label={labelById.get(chapter.id) ?? "•"}
          color={chapter.color}
          affected={aff}
        />
        <div className="min-w-0 flex-1">
          <h2 className="journey-card-title flex flex-wrap items-center gap-2 text-[19px] font-bold tracking-tight transition-colors">
            {chapter.title}
            <FlowBadge chapter={chapter} />
          </h2>
          {chapter.entryFqn && <FqnRow fqn={chapter.entryFqn} />}
          {chapter.summary && (
            <p
              className="mt-1 line-clamp-2 text-[13.5px] text-zinc-400"
              style={{ fontFamily: "var(--reading-font)" }}
            >
              {chapter.summary}
            </p>
          )}
          <RouteString
            route={routesById.get(chapter.id)}
            color={chapter.color}
            showDelta={aff}
          />
        </div>
        <RowStats
          route={routesById.get(chapter.id)}
          chapter={chapter}
          affected={aff}
        />
        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-zinc-300" />
      </div>
    </motion.div>
  );

  if (!allChapters) {
    return <Navigate to="/home" replace />;
  }
  return (
    <section
      className="relative flex h-full w-full flex-col"
      style={{ background: "var(--page-bg)" }}
    >
      <PRSummaryBanner />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Header */}
        <JourneyHeader
          onBack={onBack}
          hasPR={hasPR}
          chapters={chapters}
          impacted={impacted}
          activeStatuses={activeStatuses}
          statusCounts={statusCounts}
          setSearchOpen={setSearchOpen}
          searchOpen={searchOpen}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          setActiveStatuses={setActiveStatuses}
        />
        {/* The board — wider than the old card column: each line carries a
            route string + right-rail stats. */}
        <div className="mx-auto max-w-5xl px-6 pb-16">
          {/* Board strip — the departures-board caption over the lists. */}
          {chapters.length > 0 && (
            <div className="mb-4 flex items-baseline gap-3 border-b border-zinc-800 pb-2">
              <span className="font-mono text-[11px] tracking-[0.22em] text-zinc-500 uppercase">
                In service
              </span>
              <span className="ml-auto font-mono text-[11px] text-zinc-600">
                {plural(chapters.length, "line")} ·{" "}
                {plural(
                  chapters.reduce((n, c) => n + c.steps.length, 0),
                  "step"
                )}{" "}
                ·{" "}
                {plural(
                  new Set(
                    chapters.flatMap(
                      (c) => routesById.get(c.id)?.stops.map((s) => s.key) ?? []
                    )
                  ).size,
                  "component"
                )}
              </span>
            </div>
          )}
          {hasPR && impacted.length === 0 && unimpacted.length === 0 && (
            <div className="py-16 text-center text-zinc-600">
              {searchQuery
                ? `No journeys matching "${searchQuery}"${activeStatuses.size > 0 ? " with the selected filters" : ""}`
                : activeStatuses.size > 0
                  ? "No journeys match the selected filters."
                  : "No journeys discovered yet."}
            </div>
          )}
          {!hasPR && unimpacted.length === 0 && (
            <div className="py-16 text-center text-zinc-600">
              {searchQuery
                ? `No journeys matching "${searchQuery}"${activeStatuses.size > 0 ? " with the selected filters" : ""}`
                : activeStatuses.size > 0
                  ? "No journeys match the selected filters."
                  : "No journeys discovered yet."}
            </div>
          )}

          {/* PR-impacted journeys — grouped by intent classification when
              available (primary / secondary / noise), otherwise a flat
              list as before. */}
          {hasPR &&
            impacted.length > 0 &&
            (() => {
              // Render one impacted card. Extracted so the three intent-buckets
              // and the flat-fallback list share identical structure.
              const renderCard = (
                chapter: Chapter,
                i: number,
                opts?: { dim?: boolean; primary?: boolean }
              ) => {
                const status = chapter.prStatus!;
                const isRemoved = status === "removed";
                const isAdded = status === "added";
                const isDemoted = status === "demoted";
                const changedSteps = chapter.steps.filter(
                  (s) => s.prStatus
                ).length;
                // Status = the chip + a left accent strip ONLY. Card surface
                // and title stay neutral/ink — hierarchy comes from weight
                // and contrast, not from painting headlines in status color
                // ("I can't even read the headlines in yellow"). Surfaces and
                // borders come from the .journey-card token CSS in index.css.
                const accentClass = isRemoved
                  ? "border-l-red-500"
                  : isAdded
                    ? "border-l-emerald-600"
                    : isDemoted
                      ? "border-l-sky-600"
                      : "border-l-amber-600";
                const badgeClass = isRemoved
                  ? "bg-red-500/15 text-red-300 border border-red-500/40"
                  : isAdded
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40"
                    : isDemoted
                      ? "bg-sky-500/15 text-sky-300 border border-sky-500/40"
                      : "bg-amber-500/15 text-amber-300 border border-amber-500/40";
                const reclassLabel =
                  chapter.intentReclass &&
                  chapter.intentReclass !== "true-addition" &&
                  chapter.intentReclass !== "true-removal"
                    ? RECLASS_LABEL[chapter.intentReclass]
                    : null;
                const wrapperClass = [
                  "group journey-card relative cursor-pointer rounded-lg border border-l-4 p-4 transition-all duration-200",
                  accentClass,
                  opts?.dim ? "opacity-65 hover:opacity-100" : "",
                  opts?.primary ? "journey-primary-pulse" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <motion.div
                    key={chapter.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: staggerDelay(i, 0.04) }}
                    onClick={() => onSelectChapter(chapter.slug)}
                    className={wrapperClass}
                    data-tour="journey-row"
                    data-chapter-slug={chapter.slug}
                  >
                    {opts?.primary && (
                      <span
                        title="Directly implements PR intent"
                        aria-hidden="true"
                        className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-sm border border-cyan-400/40 bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300"
                      >
                        <Sparkles className="h-2.5 w-2.5" />
                        primary
                      </span>
                    )}
                    <div className="flex items-center gap-5">
                      <LineBadge
                        label={labelById.get(chapter.id) ?? "•"}
                        color={chapter.color}
                        affected={!isRemoved}
                      />
                      <div className="min-w-0 flex-1">
                        <h2 className="journey-card-title flex flex-wrap items-center gap-2 text-[19px] font-bold tracking-tight transition-colors">
                          {chapter.title}
                          <FlowBadge chapter={chapter} />
                          <span
                            className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10px] ${badgeClass}`}
                          >
                            <GitPullRequest className="h-2.5 w-2.5" />
                            {status}
                            {!isAdded &&
                              !isRemoved &&
                              changedSteps > 0 &&
                              ` · ${changedSteps}/${chapter.steps.length} steps`}
                          </span>
                          {reclassLabel && (
                            <span
                              title="Reclassified by AI intent-classifier — the structural prStatus alone is misleading."
                              className="rounded-sm border border-slate-600/50 bg-slate-700/40 px-1.5 py-0.5 font-mono text-[10px] text-slate-300"
                            >
                              ↻ {reclassLabel}
                            </span>
                          )}
                        </h2>
                        {chapter.entryFqn && <FqnRow fqn={chapter.entryFqn} />}
                        {chapter.intentWhy ? (
                          <p
                            className="mt-1 line-clamp-2 text-[13.5px] leading-snug text-cyan-100/85"
                            style={{ fontFamily: "var(--reading-font)" }}
                          >
                            {chapter.intentWhy}
                          </p>
                        ) : (
                          chapter.summary && (
                            <p
                              className="mt-1 line-clamp-2 text-[13.5px] text-zinc-400"
                              style={{ fontFamily: "var(--reading-font)" }}
                            >
                              {chapter.summary}
                            </p>
                          )
                        )}
                        <RouteString
                          route={routesById.get(chapter.id)}
                          color={chapter.color}
                          showDelta
                        />
                      </div>
                      <RowStats
                        route={routesById.get(chapter.id)}
                        chapter={chapter}
                        affected={!isRemoved}
                      />
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-zinc-300" />
                    </div>
                  </motion.div>
                );
              };

              // Section header — small slate caption + a hairline.
              const sectionHeader = (
                label: string,
                count: number,
                hint?: string
              ) => (
                <div className="mb-3 flex items-center gap-2">
                  <span className="font-mono text-xs tracking-wider text-zinc-500 uppercase">
                    {label} · {count}
                  </span>
                  {hint && (
                    <span className="text-[11px] text-zinc-600">{hint}</span>
                  )}
                  <div className="h-px flex-1" style={{background: "var(--bpmn-border-soft)"}} />
                </div>
              );

              if (!hasIntent) {
                // Flat list (no intent data on this run).
                return (
                  <div className="mb-6">
                    <div className="space-y-2.5">
                      {impacted.map((ch, i) => renderCard(ch, i))}
                    </div>
                  </div>
                );
              }

              return (
                <div className="mb-6 space-y-6">
                  {primary.length > 0 && (
                    <div>
                      {sectionHeader(
                        "Primary",
                        primary.length,
                        "— directly implements PR intent"
                      )}
                      <div className="space-y-2.5">
                        {primary.map((ch, i) =>
                          renderCard(ch, i, { primary: true })
                        )}
                      </div>
                    </div>
                  )}
                  {secondary.length > 0 && (
                    <div>
                      {sectionHeader(
                        "Secondary",
                        secondary.length,
                        "— supporting changes (decorator-wrap, scaffolding)"
                      )}
                      <div className="space-y-2.5">
                        {secondary.map((ch, i) =>
                          renderCard(ch, i, { dim: true })
                        )}
                      </div>
                    </div>
                  )}
                  {noise.length > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowNoise((v) => !v)}
                        aria-expanded={showNoise}
                        className="journey-card-quiet mb-3 flex w-full items-center gap-2 rounded border border-dashed px-3 py-2 transition-colors"
                      >
                        {showNoise ? (
                          <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5 text-zinc-500" />
                        )}
                        <span className="font-mono text-xs tracking-wider text-zinc-500 uppercase">
                          Structural noise · {noise.length}
                        </span>
                        <span className="text-[11px] text-zinc-600">
                          — flagged by diff, semantically inert (rename / DI /
                          unrelated refactor)
                        </span>
                        <span className="ml-auto text-[11px] text-zinc-500">
                          {showNoise ? "hide" : "show"}
                        </span>
                      </button>
                      {showNoise && (
                        <div className="space-y-2.5">
                          {noise.map((ch, i) => renderCard(ch, i, { dim: true }))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

          {/* Quiet rows: composed-but-unaffected in the default view;
              unaffected/all matching rows when pills or search are active. */}
          {unimpacted.length > 0 && (
            <div>
              {hasPR && impacted.length > 0 && (
                <div className="mb-3 flex items-center gap-2">
                  <span className="font-mono text-xs tracking-wider text-zinc-600 uppercase">
                    Unaffected · {unimpacted.length}
                  </span>
                  <div className="h-px flex-1" style={{background: "var(--bpmn-border-soft)"}} />
                </div>
              )}
              <div className="space-y-2.5">
                {unimpacted.map((chapter, i) => renderQuietRow(chapter, i, false))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default JourneyPage;

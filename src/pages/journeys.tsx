import { FqnRow, StatusLegend } from "@/components/journeys/journey-index";
import { useUIStore } from "@/store/use-ui-store";
import { Chapter, StatusKey } from "@/types/journey";
import { motion } from "motion/react";
import {
  ArrowLeft,
  ChevronDown,
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
          className="mb-3 gap-1.5 px-2 py-1 text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Canvas
        </Button>
        <h1 className="mb-1.5 text-2xl font-light tracking-tight text-zinc-100">
          Journey Index
        </h1>
        <p className="text-sm text-zinc-500">
          {chapters.length} execution paths through the codebase.
          {hasPR && impacted.length > 0 && (
            <button
              onClick={() => {
                const allImpactedActive = ALL_IMPACTED_ACTIVE.every((s) =>
                  activeStatuses.has(s as StatusKey)
                );
                setActiveStatuses(allImpactedActive ? new Set() : IMPACTED_SET);
              }}
              title="Filter to PR-impacted journeys only"
              className="ml-2 cursor-pointer text-amber-500 underline-offset-2 transition-colors hover:text-amber-300 hover:underline"
            >
              · {impacted.length} journey{impacted.length !== 1 ? "s" : ""}{" "}
              impacted by this PR
            </button>
          )}
        </p>
      </motion.div>

      {/* Search */}
      <motion.div
        className="mt-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
      >
        <div
          className="flex cursor-text items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 transition-colors hover:border-zinc-700"
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

  const prMode = useUIStore((state) => state.prMode);
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
    return prMode
      ? all
      : all.filter(
          (ch) => ch.prStatus !== "removed" && ch.prStatus !== "demoted"
        );
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
        .sort((a, b) => impactRank(b.prStatus) - impactRank(a.prStatus));
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

  // When no PR overlay, treat all as unimpacted for rendering
  const filtered = hasPR ? [] : unimpacted;
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
        {/* Chapter list */}
        <div className="mx-auto max-w-3xl px-6 pb-16">
          {hasPR && impacted.length === 0 && unimpacted.length === 0 && (
            <div className="py-16 text-center text-zinc-600">
              {searchQuery
                ? `No journeys matching "${searchQuery}"${activeStatuses.size > 0 ? " with the selected filters" : ""}`
                : activeStatuses.size > 0
                  ? "No journeys match the selected filters."
                  : "No journeys discovered yet."}
            </div>
          )}
          {!hasPR && filtered.length === 0 && (
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
                    transition={{ delay: 0.08 + i * 0.04 }}
                    onClick={() => onSelectChapter(chapter.slug)}
                    className={wrapperClass}
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
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h2 className="journey-card-title flex items-center gap-2 text-base font-semibold transition-colors">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: chapter.color }}
                          />
                          {chapter.title}
                          <span
                            className={`ml-1 inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10px] ${badgeClass}`}
                          >
                            <GitPullRequest className="h-2.5 w-2.5" />
                            {status}
                            {!isAdded &&
                              !isRemoved &&
                              changedSteps > 0 &&
                              ` · ${changedSteps}/${chapter.steps.length}`}
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
                          <p className="mt-1.5 text-sm leading-snug text-cyan-100/85">
                            {chapter.intentWhy}
                          </p>
                        ) : (
                          chapter.summary && (
                            <p className="mt-1 line-clamp-2 text-sm text-zinc-300">
                              {chapter.summary}
                            </p>
                          )
                        )}
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-zinc-300" />
                    </div>
                    <div className="mt-3">
                      <span className="font-mono text-xs text-zinc-400">
                        {chapter.phaseCount} phases · {chapter.functions.length}{" "}
                        methods · {chapter.services.length} services
                      </span>
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
                  <div className="h-px flex-1 bg-zinc-800" />
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
                        className="mb-3 flex w-full items-center gap-2 rounded border border-dashed border-zinc-800 px-3 py-2 transition-colors hover:border-zinc-700 hover:bg-zinc-900/40"
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

          {/* Unaffected journeys (or all journeys when no PR overlay) */}
          {(hasPR ? unimpacted : filtered).length > 0 && (
            <div>
              {hasPR && impacted.length > 0 && (
                <div className="mb-3 flex items-center gap-2">
                  <span className="font-mono text-xs tracking-wider text-zinc-600 uppercase">
                    Unaffected · {unimpacted.length}
                  </span>
                  <div className="h-px flex-1 bg-zinc-800" />
                </div>
              )}
              <div className="space-y-2.5">
                {(hasPR ? unimpacted : filtered).map((chapter, i) => (
                  <motion.div
                    key={chapter.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 + i * 0.05 }}
                    onClick={() => onSelectChapter(chapter.slug)}
                    className="group cursor-pointer rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-4 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900/60"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h2 className="flex items-center gap-2 text-base font-medium text-zinc-300 transition-colors group-hover:text-zinc-100">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: chapter.color }}
                          />
                          {chapter.title}
                        </h2>
                        {chapter.entryFqn && <FqnRow fqn={chapter.entryFqn} />}
                        {chapter.summary && (
                          <p className="mt-1 line-clamp-2 text-sm text-zinc-300">
                            {chapter.summary}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-zinc-300" />
                    </div>

                    <div className="mt-3">
                      <span className="font-mono text-xs text-zinc-400">
                        {chapter.phaseCount} phases · {chapter.functions.length}{" "}
                        methods · {chapter.services.length} services
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default JourneyPage;

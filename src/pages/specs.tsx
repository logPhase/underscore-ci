import DiffBlock from "@/components/journeys/DiffBlock";
import { Markdown } from "@/components/ui/Markdown";
import { splitSpecBlocks } from "@/lib/specs/ears";
import { latestByCapability, removedCapabilities } from "@/lib/specs/history";
import { relativeTime } from "@/lib/specs/relative-time";
import type { ReqChange } from "@/lib/specs/req-diff";
import { useAnalysis } from "@/store/use-analysis-store";
import { useSpecsStore } from "@/store/use-specs-store";
import type { SpecHistoryEvent, SpecOperation } from "@/types/specs";
import { ArrowLeft, FileText, History, ScrollText } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Navigate } from "react-router-dom";

/**
 * SpecsPage — the repo's behavioral contract as a LIVING CONTROLLED
 * DOCUMENT. The visual language is borrowed from real spec documents:
 * margin change bars next to requirements the latest revision touched,
 * a revision strip (document-control block turned timeline) in the
 * header, and SUPERSEDED treatment for deleted capabilities. Left:
 * capability list, newest activity first. Right: the EARS reader, a
 * capability's revision history, or a version diff — same panel, list
 * never moves (staining, not switching).
 *
 * Ported from the desktop living-specs page. In the static report the
 * whole specs bundle is baked into the payload, so this is payload-driven
 * (no fetching, no auth/network states): if the page renders, specs exist.
 */

/** "license-plate-identifier" → "License plate identifier". */
function capabilityTitle(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const OP_STYLE: Record<
  SpecOperation,
  { label: string; cls: string; dot: string }
> = {
  created: {
    label: "created",
    cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    dot: "#10b981",
  },
  updated: {
    label: "updated",
    cls: "border-sky-500/30 bg-sky-500/10 text-sky-400",
    dot: "#38bdf8",
  },
  deleted: {
    label: "superseded",
    cls: "border-red-500/30 bg-red-500/10 text-red-400",
    dot: "#f87171",
  },
};

/** TOLERANT operation lookup — the wire outgrew the UI's vocabulary (newer
 * analyzers emit "modified"; the hard OP_STYLE[op] index threw and blanked
 * the whole app). Known ops style as themselves; "modified" borrows the
 * updated style but keeps its honest label; anything unknown renders neutral
 * with the raw label — never throws. */
const opStyle = (op: string): { label: string; cls: string; dot: string } => {
  if (op in OP_STYLE) return OP_STYLE[op as SpecOperation];
  if (op === "modified") return { ...OP_STYLE.updated, label: "modified" };
  return {
    label: op || "changed",
    cls: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
    dot: "#8b93a7",
  };
};

/** Bucket an arbitrary wire op into the three summary families. */
const opFamily = (op: string): SpecOperation =>
  op === "created" || op === "deleted" ? op : "updated";

const FRESH_MS = 48 * 60 * 60 * 1000;
const isFresh = (at: string) => Date.now() - Date.parse(at) < FRESH_MS;

const OpBadge = ({ op }: { op: string }) => (
  <span
    className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap ${opStyle(op).cls}`}
  >
    {opStyle(op).label}
  </span>
);

/** A revision dot — pulses softly while the event is fresh (<48h). */
const RevisionDot = ({
  event,
  index,
  onOpen,
}: {
  event: SpecHistoryEvent;
  index: number;
  onOpen: (event: SpecHistoryEvent) => void;
}) => (
  <button
    type="button"
    onClick={() => onOpen(event)}
    aria-label={`${capabilityTitle(event.capability)} ${opStyle(event.operation).label} ${relativeTime(event.at)} — view change`}
    title={`${capabilityTitle(event.capability)} · ${opStyle(event.operation).label} · ${relativeTime(event.at)}`}
    className={`h-2.5 w-2.5 shrink-0 animate-fade-in cursor-pointer rounded-full transition-transform hover:scale-150 focus-visible:ring-2 focus-visible:ring-[var(--bpmn-cyan)] focus-visible:outline-none ${
      isFresh(event.at) ? "spec-fresh" : ""
    }`}
    style={{
      background: opStyle(event.operation).dot,
      // Stagger the strip's entrance — one orchestrated moment, ~250ms total.
      animationDelay: `${index * 25}ms`,
      ["--pulse-color" as string]: opStyle(event.operation).dot,
    }}
  />
);

/** "2 updated · 1 new" for the last 7 days of (newest-first) history. */
function activitySummary(history: SpecHistoryEvent[]): string {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const counts: Record<SpecOperation, number> = {
    created: 0,
    updated: 0,
    deleted: 0,
  };
  for (const e of history) {
    if (Date.parse(e.at) < weekAgo) break; // newest-first
    counts[opFamily(e.operation)]++;
  }
  return (
    [
      counts.updated && `${counts.updated} updated`,
      counts.created && `${counts.created} new`,
      counts.deleted && `${counts.deleted} superseded`,
    ].filter(Boolean) as string[]
  ).join(" · ");
}

/** The document-control block as a live timeline: the last revisions as
 *  clickable dots on a rule, oldest → newest. */
const RevisionStrip = ({
  history,
  onOpen,
}: {
  history: SpecHistoryEvent[];
  onOpen: (event: SpecHistoryEvent) => void;
}) => {
  const recent = useMemo(() => history.slice(0, 12).reverse(), [history]);
  const summary = useMemo(() => activitySummary(history), [history]);

  if (recent.length === 0) return null;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className="hidden font-mono text-[10px] tracking-wider uppercase sm:block"
        style={{ color: "var(--bpmn-text-dim)" }}
      >
        Revisions
      </span>
      <div className="flex items-center gap-1.5">
        {recent.map((event, i) => (
          <RevisionDot
            key={event.version_id || String(i)}
            event={event}
            index={i}
            onOpen={onOpen}
          />
        ))}
      </div>
      {summary && (
        <span
          className="truncate font-mono text-[11px]"
          style={{ color: "var(--bpmn-text)" }}
          title="Spec activity in the last 7 days"
        >
          {summary}
          <span style={{ color: "var(--bpmn-text-dim)" }}> this week</span>
        </span>
      )}
    </div>
  );
};

const SpecsPage = () => {
  const specsPayload = useAnalysis((s) => s.transformedData?.specs);

  const {
    status,
    specs,
    history,
    selected,
    view,
    diff,
    diffError,
    reqChanges,
    removedReqCounts,
    load,
    select,
    setView,
    openDiff,
    closeDiff,
    ensureReqChanges,
  } = useSpecsStore();

  // Payload → store. Re-runs only when the embedded bundle changes.
  useEffect(() => {
    if (specsPayload) load(specsPayload);
  }, [specsPayload, load]);

  // Change bars load lazily per selected capability (pure, no fetch).
  useEffect(() => {
    if (selected && status === "ready") ensureReqChanges(selected);
  }, [selected, status, ensureReqChanges]);

  const latest = useMemo(() => latestByCapability(history), [history]);
  const removed = useMemo(
    () =>
      removedCapabilities(
        history,
        specs.map((s) => s.capability)
      ),
    [history, specs]
  );
  const orderedSpecs = useMemo(
    () =>
      [...specs].sort((a, b) =>
        (latest.get(b.capability)?.at ?? "").localeCompare(
          latest.get(a.capability)?.at ?? ""
        )
      ),
    [specs, latest]
  );
  const selectedSpec = specs.find((s) => s.capability === selected) ?? null;
  const selectedHistory = useMemo(
    () => history.filter((e) => e.capability === selected),
    [history, selected]
  );

  const openEventDiff = (event: SpecHistoryEvent) => {
    select(event.capability);
    openDiff(event);
  };

  // The rail hides this tab without specs, but guard deep links too.
  if (!specsPayload) return <Navigate to="/journeys" replace />;
  const repoId = specsPayload.repo_id;

  return (
    <section
      className="flex h-full w-full flex-col"
      style={{ background: "var(--page-bg)" }}
    >
      {/* Header — identity left, the revision strip is the entry anchor */}
      <header
        className="flex shrink-0 items-center gap-3 border-b px-5 py-3"
        style={{ borderColor: "var(--bpmn-border-soft)" }}
      >
        <ScrollText
          className="h-4 w-4 shrink-0"
          style={{ color: "var(--bpmn-text-dim)" }}
        />
        <h1
          className="text-[14px] font-semibold whitespace-nowrap"
          style={{
            fontFamily: "var(--bpmn-font-display)",
            color: "var(--bpmn-text)",
          }}
        >
          Specs
        </h1>
        <span
          className="hidden truncate font-mono text-[11px] md:block"
          style={{ color: "var(--bpmn-text-dim)" }}
          title={`Analyzer repo: ${repoId}`}
        >
          {repoId}
        </span>
        <span className="ml-auto" />
        {status === "ready" && (
          <RevisionStrip history={history} onOpen={openEventDiff} />
        )}
      </header>

      {/* States */}
      {status === "empty" ? (
        <EmptyState
          title="No specs yet"
          detail="The analyzer writes behavioral specs after each PR analysis — this report was built before any were recorded."
        />
      ) : status !== "ready" ? (
        <EmptyState title="Loading specs…" />
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Capability list */}
          <nav
            aria-label="Capabilities"
            className="flex w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-2"
            style={{ borderColor: "var(--bpmn-border-soft)" }}
          >
            {orderedSpecs.map((spec) => {
              const last = latest.get(spec.capability);
              const active = spec.capability === selected;
              return (
                <button
                  key={spec.capability}
                  type="button"
                  onClick={() => select(spec.capability)}
                  className={`rail-nav-item flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-[var(--bpmn-cyan)] focus-visible:outline-none ${
                    active ? "rail-nav-active" : ""
                  }`}
                >
                  <span
                    aria-hidden
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      last && isFresh(last.at) ? "spec-fresh" : ""
                    }`}
                    style={{
                      background: last
                        ? opStyle(last.operation).dot
                        : "var(--bpmn-border-soft)",
                      ["--pulse-color" as string]: last
                        ? opStyle(last.operation).dot
                        : "transparent",
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className="line-clamp-1 text-[12.5px]"
                      style={{
                        fontFamily: "var(--reading-font)",
                        color: "var(--bpmn-text)",
                        fontWeight: active ? 600 : 500,
                      }}
                      title={capabilityTitle(spec.capability)}
                    >
                      {capabilityTitle(spec.capability)}
                    </span>
                    {last && (
                      <span
                        className="block font-mono text-[10px]"
                        style={{ color: "var(--bpmn-text-dim)" }}
                      >
                        {opStyle(last.operation).label} {relativeTime(last.at)}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}

            {removed.length > 0 && (
              <details className="mt-2">
                <summary
                  className="cursor-pointer px-2.5 font-mono text-[10px] tracking-wider uppercase"
                  style={{ color: "var(--bpmn-text-dim)" }}
                >
                  Superseded ({removed.length})
                </summary>
                {removed.map((event, i) => (
                  <button
                    key={event.version_id || String(i)}
                    type="button"
                    onClick={() => openEventDiff(event)}
                    title={`Superseded ${relativeTime(event.at)} — view what it said`}
                    className="rail-nav-item flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-left"
                  >
                    <span
                      aria-hidden
                      className="shrink-0 font-mono text-[10px]"
                      style={{ color: OP_STYLE.deleted.dot }}
                    >
                      ✕
                    </span>
                    <span
                      className="line-clamp-1 text-[12px] line-through opacity-70"
                      style={{
                        fontFamily: "var(--reading-font)",
                        color: "var(--bpmn-text-dim)",
                      }}
                    >
                      {capabilityTitle(event.capability)}
                    </span>
                  </button>
                ))}
              </details>
            )}
          </nav>

          {/* Reader / history / diff */}
          <div className="min-w-0 flex-1 overflow-y-auto">
            {diff ? (
              <DiffView diff={diff} onBack={() => closeDiff()} />
            ) : selectedSpec ? (
              <article className="mx-auto max-w-3xl px-6 py-5">
                <div className="mb-1 flex items-center gap-2">
                  <FileText
                    className="h-4 w-4 shrink-0"
                    style={{ color: "var(--bpmn-text-dim)" }}
                  />
                  <h2
                    className="min-w-0 truncate text-[16px] font-semibold"
                    style={{
                      fontFamily: "var(--bpmn-font-display)",
                      color: "var(--bpmn-text)",
                    }}
                  >
                    {capabilityTitle(selectedSpec.capability)}
                  </h2>
                  <span className="ml-auto" />
                  {selectedHistory.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setView(view === "history" ? "spec" : "history")
                      }
                      className={`rail-nav-item flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] whitespace-nowrap ${
                        view === "history" ? "rail-nav-active" : ""
                      }`}
                      style={{ borderColor: "var(--bpmn-border-soft)" }}
                    >
                      <History className="h-3 w-3" />
                      history ({selectedHistory.length})
                    </button>
                  )}
                </div>

                {/* Revision context line — what the change bars refer to */}
                <RevisionNote
                  capability={selectedSpec.capability}
                  latest={latest.get(selectedSpec.capability)}
                  touched={reqChanges[selectedSpec.capability]}
                  removedCount={removedReqCounts[selectedSpec.capability] ?? 0}
                  onShowHistory={() => setView("history")}
                />

                {diffError && (
                  <p
                    className="mb-3 font-mono text-[11px]"
                    style={{ color: "var(--bpmn-amber)" }}
                  >
                    {diffError}
                  </p>
                )}

                {view === "history" ? (
                  <HistoryTimeline events={selectedHistory} onOpen={openDiff} />
                ) : (
                  <SpecReader
                    content={selectedSpec.content ?? ""}
                    touched={reqChanges[selectedSpec.capability]}
                  />
                )}
              </article>
            ) : (
              <EmptyState title="Select a capability" />
            )}
          </div>
        </div>
      )}
    </section>
  );
};

/** "Rev · updated 2h ago · 3 requirements revised, 1 removed" — the
 *  document-control caption the change bars hang off. */
const RevisionNote = ({
  latest,
  touched,
  removedCount,
  onShowHistory,
}: {
  capability: string;
  latest: SpecHistoryEvent | undefined;
  touched: Map<number, ReqChange> | undefined;
  removedCount: number;
  onShowHistory: () => void;
}) => {
  if (!latest) return <div className="mb-4" />;
  const changed = touched
    ? [...touched.values()].filter((c) => c === "changed").length
    : 0;
  const added = touched
    ? [...touched.values()].filter((c) => c === "new").length
    : 0;
  const parts = [
    changed && `${changed} requirement${changed > 1 ? "s" : ""} revised`,
    added && `${added} added`,
    removedCount && `${removedCount} removed`,
  ].filter(Boolean) as string[];

  return (
    <p
      className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px]"
      style={{ color: "var(--bpmn-text-dim)" }}
    >
      <OpBadge op={latest.operation} />
      {relativeTime(latest.at)}
      {parts.length > 0 && (
        <>
          <span aria-hidden>·</span>
          <span style={{ color: "var(--bpmn-amber)" }}>{parts.join(", ")}</span>
          <button
            type="button"
            onClick={onShowHistory}
            className="cursor-pointer underline decoration-dotted underline-offset-2"
            style={{ color: "var(--bpmn-text-dim)" }}
          >
            view revisions
          </button>
        </>
      )}
    </p>
  );
};

/** The EARS-aware reader with MARGIN CHANGE BARS — the controlled-document
 *  idiom: a colored bar beside every requirement the latest revision
 *  touched (amber = revised, emerald = new). Untouched requirements stay
 *  quiet. */
const SpecReader = ({
  content,
  touched,
}: {
  content: string;
  touched: Map<number, ReqChange> | undefined;
}) => {
  const blocks = useMemo(() => splitSpecBlocks(content), [content]);
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => {
        if (block.kind === "md") return <Markdown key={i} text={block.text} />;
        const change = touched?.get(block.reqNo);
        const barColor =
          change === "changed"
            ? "var(--bpmn-amber)"
            : change === "new"
              ? OP_STYLE.created.dot
              : "transparent";
        return (
          <div
            key={i}
            id={`req-${block.reqNo}`}
            className="flex items-start gap-2.5 rounded-md border py-2 pr-3 pl-2.5"
            style={{
              borderColor: "var(--bpmn-border-soft)",
              background: "var(--bpmn-surface-soft)",
              borderLeft: `3px solid ${barColor}`,
            }}
            title={
              change === "changed"
                ? "Revised in the latest version"
                : change === "new"
                  ? "Added in the latest version"
                  : undefined
            }
          >
            <span
              className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap"
              style={{
                background: "var(--bpmn-bg-deep)",
                color: "var(--bpmn-cyan)",
              }}
            >
              REQ-{block.reqNo}
            </span>
            <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
              <Markdown text={block.text} />
            </div>
            {change && (
              <span
                className="mt-0.5 shrink-0 font-mono text-[9.5px] tracking-wider uppercase"
                style={{
                  color:
                    change === "new"
                      ? OP_STYLE.created.dot
                      : "var(--bpmn-amber)",
                }}
              >
                {change === "new" ? "new" : "revised"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

const HistoryTimeline = ({
  events,
  onOpen,
}: {
  events: SpecHistoryEvent[];
  onOpen: (event: SpecHistoryEvent) => void;
}) => (
  <ol className="flex flex-col gap-1.5">
    {events.map((event, i) => (
      <li key={event.version_id || String(i)}>
        <button
          type="button"
          onClick={() => onOpen(event)}
          title="View this change as a diff"
          className="rail-nav-item flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-1.5 text-left"
        >
          <OpBadge op={event.operation} />
          <span
            className="font-mono text-[11px] whitespace-nowrap"
            style={{ color: "var(--bpmn-text)" }}
          >
            {relativeTime(event.at)}
          </span>
          <span
            className="ml-auto shrink-0 font-mono text-[10px]"
            style={{ color: "var(--bpmn-text-dim)" }}
          >
            {event.size} B
          </span>
        </button>
      </li>
    ))}
  </ol>
);

const DiffView = ({
  diff,
  onBack,
}: {
  diff: NonNullable<ReturnType<typeof useSpecsStore.getState>["diff"]>;
  onBack: () => void;
}) => (
  <article className="mx-auto max-w-3xl px-6 py-5">
    <div className="mb-4 flex items-center gap-2.5">
      <button
        type="button"
        onClick={onBack}
        className="rail-nav-item flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] whitespace-nowrap"
        style={{ borderColor: "var(--bpmn-border-soft)" }}
      >
        <ArrowLeft className="h-3 w-3" />
        back
      </button>
      <h2
        className="min-w-0 truncate text-[15px] font-semibold"
        style={{
          fontFamily: "var(--bpmn-font-display)",
          color: "var(--bpmn-text)",
        }}
      >
        {capabilityTitle(diff.event.capability)}
      </h2>
      <OpBadge op={diff.event.operation} />
      <span
        className="ml-auto shrink-0 font-mono text-[11px] whitespace-nowrap"
        style={{ color: "var(--bpmn-text-dim)" }}
      >
        {relativeTime(diff.event.at)}
      </span>
    </div>
    {/* A deleted version's snapshot IS the last content — diff it to empty. */}
    <DiffBlock
      before={
        diff.event.operation === "deleted"
          ? diff.after.content
          : (diff.before?.content ?? "")
      }
      after={diff.event.operation === "deleted" ? "" : diff.after.content}
      lang="markdown"
    />
    {diff.event.operation === "deleted" && (
      <p
        className="mt-3 font-mono text-[11px]"
        style={{ color: "var(--bpmn-text-dim)" }}
      >
        This capability was superseded — the red side is its last content.
      </p>
    )}
  </article>
);

const EmptyState = ({ title, detail }: { title: string; detail?: string }) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
    <p
      className="text-[14px]"
      style={{
        fontFamily: "var(--reading-font)",
        color: "var(--bpmn-text)",
      }}
    >
      {title}
    </p>
    {detail && (
      <p
        className="max-w-md font-mono text-[11px]"
        style={{ color: "var(--bpmn-text-dim)" }}
      >
        {detail}
      </p>
    )}
  </div>
);

export default SpecsPage;

import HoverTip from "@/components/ui/hover-tip";
import { langFromFile } from "@/components/ui/CodeHighlight";
import { getComponentFunctions } from "@/lib/canvas/get-data";
import { useAnalysis } from "@/store/use-analysis-store";
import { useJourneyUIStore } from "@/store/use-journey-ui-store";
import { ComponentFunction, MethodIndexEntry } from "@/types/analysis";
import { Chapter, ChapterStep } from "@/types/journey";
import type { BpmnElement } from "@/components/bpmn/types";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  FileText,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Workflow,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { STATUS_STYLES } from "@/lib/status-colors";
import { getPROverlay } from "@/data/parity-loader";
import { findReplacement } from "@/lib/callgraph/forest";
import CodeBlock from "./CodeBlock";
import DiffBlock from "./DiffBlock";
import {
  useCodeView,
  type CodeSourceView,
} from "@/components/journeys/code-view-store";

type SourceView = CodeSourceView;

type DockPosition = "bottom" | "right" | "left";

const DOCK_OPTIONS: {
  pos: DockPosition;
  icon: React.ReactNode;
  title: string;
}[] = [
  { pos: "left", icon: <PanelLeft className="h-3 w-3" />, title: "Dock left" },
  {
    pos: "bottom",
    icon: <PanelBottom className="h-3 w-3" />,
    title: "Dock bottom",
  },
  {
    pos: "right",
    icon: <PanelRight className="h-3 w-3" />,
    title: "Dock right",
  },
];


interface FunctionBodyPanelProps {
  chapter: Chapter;
  dockPosition: DockPosition;
  onDockChange: (pos: DockPosition) => void;
  /** Reverse link into the business flow: invoked with the BPMN element
   *  that cites the active method. The parent switches to the flow view
   *  with that step's functions listed. Absent ⇒ chip renders inert. */
  onJumpToFlowStep?: (element: BpmnElement) => void;
}

// PR status pill styling — kept local to the panel so it can be tuned
// without dragging in the chart-internal PR_CHANGE_COLORS map.
// Canonical status palette (src/lib/status-colors.ts) — same hues as the
// call graph, BPMN nodes, and journey badges.
const PR_STATUS_PILL: Record<
  string,
  { label: string; icon: string; style: React.CSSProperties }
> = Object.fromEntries(
  (["modified", "added", "deleted", "disconnected"] as const).map((k) => [
    k,
    {
      label: STATUS_STYLES[k].label,
      icon: STATUS_STYLES[k].icon || "~",
      style: {
        background: STATUS_STYLES[k].bg,
        color: STATUS_STYLES[k].text,
        borderColor: STATUS_STYLES[k].border,
      },
    },
  ])
);

const SOURCE_VIEW_LABEL: Record<SourceView, string> = {
  diff: "diff vs base",
  current: "current head",
};

function shortName(fqn: string): string {
  const base = fqn.replace(/\(.*\)$/, "");
  const parts = base.split(".");
  return parts[parts.length - 1] || fqn;
}

function extractParams(fqn: string): string {
  const match = fqn.match(/\(([^)]*)\)/);
  return match ? match[1] : "";
}

const FunctionBodyPanel: React.FC<FunctionBodyPanelProps> = ({
  chapter,
  dockPosition,
  onDockChange,
  onJumpToFlowStep,
}) => {
  const activeFunctionId = useJourneyUIStore((state) => state.activeFunctionId);
  const setActiveFunctionId = useJourneyUIStore(
    (state) => state.setActiveFunctionId
  );
  // Shared preference (code-view store): the CODE dock, call-graph panel
  // and step dialog all follow one choice; DIFF is the default — in a PR
  // report the change is the content.
  const sourceView = useCodeView((s) => s.sourceView);
  const setSourceView = useCodeView((s) => s.setSourceView);

  const functionToChapters = useAnalysis(
    (state) => state.transformedData.functionToChapters
  );
  const chapterById = useAnalysis((state) => state.transformedData.chapterById);
  const globalMethodIndex = useAnalysis(
    (state) => state.transformedData.globalMethodIndex
  );

  const getChapterById = useCallback(
    (id: string): Chapter | null => {
      return chapterById.get(id) || null;
    },
    [chapterById]
  );

  const getChaptersForFunction = useCallback(
    (fqn: string): string[] => {
      return functionToChapters.get(fqn) || [];
    },
    [functionToChapters]
  );

  const getMethodInfo = useCallback(
    (fqn: string): MethodIndexEntry | undefined => globalMethodIndex.get(fqn),
    [globalMethodIndex]
  );

  // Find the matching chapter step (carries prStatus + body + beforeBody)
  const step = useMemo<ChapterStep | null>(() => {
    if (!activeFunctionId) return null;
    return chapter.steps.find((s) => s.fqn === activeFunctionId) || null;
  }, [activeFunctionId, chapter.steps]);

  // Look up the ComponentFunction for the active FQN — may be undefined for
  // deleted steps (method is gone from HEAD).
  const functionData = useMemo<ComponentFunction | null>(() => {
    if (!activeFunctionId) return null;
    const methodInfo = getMethodInfo(activeFunctionId);
    if (!methodInfo) return null;
    const fileFunctions = getComponentFunctions(methodInfo.fileId);
    return fileFunctions.find((f) => f.id === activeFunctionId) || null;
  }, [activeFunctionId, getMethodInfo]);

  const methodInfo = useMemo(() => {
    if (!activeFunctionId) return null;
    return getMethodInfo(activeFunctionId) || null;
  }, [activeFunctionId, getMethodInfo]);

  // Reverse link: which business-flow step is this method part of?
  // (BPMN elements cite methods via code_evidence / legacy code_fqns;
  // match exact then paramless.) First citing element wins.
  const bpmnStep = useMemo<BpmnElement | null>(() => {
    if (!activeFunctionId || !chapter.bpmn?.elements) return null;
    const strip = (s: string) => s.replace(/\(.*$/, "").trim();
    // Citations vary: full FQN or short "Class.Method", and the BPMN
    // cites IMPLEMENTATIONS while the call graph often lands on the
    // INTERFACE method (IContractBenefitMapper vs ContractBenefitMapper).
    // Compare on Class.Method with the I-prefix stripped — same
    // convention as the webapp's JourneySignature port matching.
    const classMethod = (s: string) => {
      const parts = strip(s).split(".");
      const m = parts.pop() ?? "";
      const cls = (parts.pop() ?? "").replace(/^I(?=[A-Z])/, "");
      return `${cls}.${m}`;
    };
    const want = classMethod(activeFunctionId);
    const matches = (f: string) => classMethod(f) === want;
    return (
      chapter.bpmn.elements.find((el) => {
        const cited = [
          ...(el.code_evidence ?? []).map((ev) => ev.fqn),
          ...(el.code_fqns ?? []),
        ];
        return cited.some(matches);
      }) ?? null
    );
  }, [activeFunctionId, chapter.bpmn]);

  // Cross-chapter references
  const crossChapters = useMemo(() => {
    if (!activeFunctionId) return [];
    const chapterIds = getChaptersForFunction(activeFunctionId);
    return chapterIds
      .filter((id) => id !== chapter.id)
      .map((id) => getChapterById(id))
      .filter((c): c is Chapter => c !== null);
  }, [activeFunctionId, chapter.id, getChapterById, getChaptersForFunction]);

  // We need EITHER methodInfo OR a matching step to render — deleted methods
  // will not have methodInfo but will have a step.
  if (!activeFunctionId || (!methodInfo && !step)) {
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{ background: "var(--bpmn-bg)" }}
      >
        <div className="text-center">
          <div className="mb-1 font-mono text-xs text-zinc-600">
            No method selected
          </div>
          <div className="text-[10px] text-zinc-700">
            Click a method in the flowchart above
          </div>
        </div>
      </div>
    );
  }

  return (
    <MemoizedFunctionBodyPanelContent
      key={activeFunctionId}
      activeFunctionId={activeFunctionId}
      chapter={chapter}
      dockPosition={dockPosition}
      onDockChange={onDockChange}
      sourceView={sourceView}
      setSourceView={setSourceView}
      setActiveFunctionId={setActiveFunctionId}
      step={step}
      functionData={functionData}
      methodInfo={methodInfo}
      crossChapters={crossChapters}
      bpmnStep={bpmnStep}
      onJumpToFlowStep={onJumpToFlowStep}
    />
  );
};

export default memo(FunctionBodyPanel);

type FunctionBodyPanelContentProps = {
  activeFunctionId: string;
  chapter: Chapter;
  dockPosition: DockPosition;
  onDockChange: (position: DockPosition) => void;
  sourceView: SourceView;
  setSourceView: (view: SourceView) => void;
  setActiveFunctionId: typeof useJourneyUIStore.getState extends () => infer T
    ? T extends { setActiveFunctionId: infer F }
      ? F
      : never
    : never;
  step: ChapterStep | null;
  functionData: ComponentFunction | null;
  methodInfo: MethodIndexEntry | null;
  crossChapters: Chapter[];
  bpmnStep: BpmnElement | null;
  onJumpToFlowStep?: (element: BpmnElement) => void;
};

const FunctionBodyPanelContent: React.FC<FunctionBodyPanelContentProps> = ({
  activeFunctionId,
  chapter,
  dockPosition,
  onDockChange,
  sourceView,
  setSourceView,
  setActiveFunctionId,
  step,
  functionData,
  methodInfo,
  crossChapters,
  bpmnStep,
  onJumpToFlowStep,
}) => {
  const navigate = useNavigate();
  // Collapse callers/callees when the active function changes — per-method (through remount)
  // concerns, not a persisted preference. Source view persists via localStorage.
  const [callersOpen, setCallersOpen] = useState(false);
  const [calleesOpen, setCalleesOpen] = useState(false);

  const name = shortName(activeFunctionId);
  const params = extractParams(activeFunctionId);

  const prStatus = step?.prStatus;

  // Figure out which source to show. For modified steps, the toggle swaps
  // between head (current), base (previous), and a unified diff. For deleted,
  // only the base body is available and we always show it. For everything
  // else, show the head body — preferring the chapter step body over
  // functionData.body because the step carries the body we actually fetched
  // during analysis.
  const headBody = step?.body || functionData?.body || "";
  const baseBody = step?.beforeBody || "";
  const canToggle = prStatus === "modified" && !!baseBody && !!headBody;
  const effectiveView: SourceView = canToggle ? sourceView : "current";
  const displayBody =
    prStatus === "deleted" ? step?.body || "" /* base body on the step */ : headBody;

  const prPill = prStatus ? PR_STATUS_PILL[prStatus] : null;

  // Deleted method → surface its successor when determinable (an ADDED step
  // with the same method name, same class/file preferred). Heuristic until
  // the payload ships the pipeline's exact rename mapping (:old-fqn).
  const replacementFqn =
    prStatus === "deleted"
      ? findReplacement(
          activeFunctionId,
          chapter.steps,
          step?.file,
          // Exact rename lineage (oldFqn) from the PR overlay — newer
          // payloads; the heuristic inside covers older ones.
          getPROverlay()?.snapshots
        )
      : null;

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: "var(--bpmn-bg)" }}
    >
      <div className="space-y-4 p-4">
        {/* Sticky header — keeps the method identity + PR status visible
            even after the user has scrolled deep into the source body. */}
        <div
          className="sticky -top-4 z-10 -mx-4 -mt-4 space-y-3 border-b border-zinc-800/40 px-4 pt-4 pb-3"
          style={{ background: "var(--bpmn-bg)" }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {/* Method name + PR status + signature */}
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-mono text-base leading-none font-medium text-zinc-100">
                  {name}
                </h2>
                {prPill && (
                  <span
                    className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px]"
                    style={prPill.style}
                    title={`This method is ${prPill.label} in the PR`}
                  >
                    <span className="font-bold">{prPill.icon}</span>
                    {prPill.label}
                  </span>
                )}
                {params && (
                  <span className="font-mono text-[10px] text-zinc-500">
                    ({params})
                  </span>
                )}
              </div>
              {/* Full FQN — left-truncate with leading ellipsis so the
                  meaningful tail (class.method) is preserved when the
                  namespace prefix is long. */}
              <HoverTip tip={activeFunctionId} side="bottom" align="start">
                <div
                  className="mt-1 truncate text-left font-mono text-[10px] leading-tight text-zinc-600"
                  style={{ direction: "rtl" }}
                >
                  <bdi>{activeFunctionId}</bdi>
                </div>
              </HoverTip>
              {prStatus === "deleted" && (
                <div className="mt-1.5 font-mono text-[10.5px]">
                  {replacementFqn ? (
                    <button
                      type="button"
                      onClick={() => setActiveFunctionId(replacementFqn)}
                      className="inline-flex cursor-pointer items-center gap-1 rounded border px-1.5 py-0.5"
                      style={{
                        color: STATUS_STYLES.added.text,
                        borderColor: STATUS_STYLES.added.border,
                        background: STATUS_STYLES.added.bg,
                      }}
                      title={replacementFqn}
                    >
                      replaced by → {replacementFqn.replace(/\(.*$/, "").split(".").slice(-2).join(".")}
                    </button>
                  ) : (
                    <span style={{ color: "var(--bpmn-text-dim)" }}>
                      removed in this PR — no direct replacement traced
                    </span>
                  )}
                </div>
              )}
            </div>
            {/* Dock position controls — separated from the close X with a
                spacer so they don't read as one cluster. */}
            <div className="flex shrink-0 items-center overflow-hidden rounded border border-zinc-800/60">
              {DOCK_OPTIONS.map(({ pos, icon, title }) => (
                <HoverTip key={pos} tip={title}>
                  <button
                    onClick={() => onDockChange(pos)}
                    className={`p-1 transition-colors ${
                      dockPosition === pos
                        ? "bg-teal-900/30 text-teal-400"
                        : "text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                    }`}
                  >
                    {icon}
                  </button>
                </HoverTip>
              ))}
            </div>
            <div className="h-5 w-px shrink-0 self-center bg-zinc-800" />
            <HoverTip tip="Close">
              <button
                onClick={() => setActiveFunctionId(null)}
                className="shrink-0 rounded p-1 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </HoverTip>
          </div>
        </div>

        {/* Metadata chips — same height + bordered shape so the three
            facets (service, role, visibility) read as a coherent row
            instead of three random visual treatments. */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Business-flow step chip — the reverse link. The call graph
              tells you WHERE in the structure you are; this tells you
              WHAT business step the method serves, and jumps there. */}
          {bpmnStep && (
            <HoverTip
              tip={`This method implements the "${bpmnStep.label}" step — open the business flow with its functions listed`}
            >
              <button
                onClick={() => onJumpToFlowStep?.(bpmnStep)}
                className="inline-flex items-center gap-1.5 rounded border border-emerald-900/60 bg-emerald-950/40 px-2 py-0.5 font-mono text-[10px] leading-5 text-emerald-300/90 transition-colors hover:border-emerald-700 hover:text-emerald-200"
              >
                <Workflow className="h-3 w-3 flex-shrink-0" />
                <span className="max-w-[200px] truncate">
                  step: {bpmnStep.label}
                </span>
              </button>
            </HoverTip>
          )}
          {/* Service chip */}
          <span className="inline-flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 font-mono text-[10px] leading-5 text-zinc-300">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: chapter.color }}
            />
            {methodInfo?.service || step?.class || "—"}
          </span>

          {/* File chip — basename on the chip, full path in the hover tip. */}
          {(() => {
            const filePath = methodInfo?.filePath || step?.file || "";
            if (!filePath) return null;
            const fileName = filePath.split("/").pop() || filePath;
            return (
              <HoverTip tip={filePath} side="bottom" align="start">
                <span className="inline-flex max-w-[260px] items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 font-mono text-[10px] leading-5 text-zinc-300">
                  <FileText className="h-3 w-3 shrink-0 text-zinc-500" />
                  <span className="truncate">{fileName}</span>
                </span>
              </HoverTip>
            );
          })()}

          {/* Visibility chip */}
          {functionData && (
            <span
              className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] leading-5 ${
                functionData.isPublic
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-zinc-700 bg-zinc-900/60 text-zinc-500"
              }`}
            >
              {functionData.isPublic ? "public" : "private"}
            </span>
          )}
        </div>

        {/* Description */}
        {functionData?.description && (
          <p className="text-xs leading-relaxed text-zinc-400">
            {functionData.description}
          </p>
        )}

        {/* Metrics — uniform label / value pairs. Complexity is colored by
            severity (lower-is-better); importance is colored by magnitude
            (higher-is-louder) so polarity is visible at a glance. */}
        {functionData &&
          (() => {
            const importancePct = functionData.importance * 100;
            const importanceColor =
              importancePct >= 75
                ? "text-amber-300"
                : importancePct >= 40
                  ? "text-zinc-200"
                  : "text-zinc-400";
            const complexityColor =
              functionData.complexity > 7
                ? "text-red-400"
                : functionData.complexity > 4
                  ? "text-amber-400"
                  : "text-emerald-400";
            return (
              <div className="flex items-center gap-5 font-mono text-[11px]">
                <HoverTip tip="Cyclomatic complexity (1–10). Lower is better — green ≤4, amber 5–7, red ≥8.">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-zinc-500">complexity</span>
                    <span
                      className={`font-semibold tabular-nums ${complexityColor}`}
                    >
                      {functionData.complexity}
                    </span>
                    <span className="text-zinc-700">/ 10</span>
                  </div>
                </HoverTip>
                <HoverTip tip="Lines of code in this method body.">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-zinc-500">lines</span>
                    <span className="font-semibold text-zinc-200 tabular-nums">
                      {functionData.lines}
                    </span>
                  </div>
                </HoverTip>
                <HoverTip tip="Importance score (0–100%). Higher = called from more places / on more critical paths.">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-zinc-500">importance</span>
                    <span
                      className={`font-semibold tabular-nums ${importanceColor}`}
                    >
                      {importancePct.toFixed(0)}
                      <span className="font-normal opacity-70">%</span>
                    </span>
                  </div>
                </HoverTip>
                {functionData.calls.length > 0 && (
                  <HoverTip tip="Number of methods this one calls. Click below to expand the list.">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-zinc-500">calls</span>
                      <span className="font-semibold text-zinc-200 tabular-nums">
                        {functionData.calls.length}
                      </span>
                    </div>
                  </HoverTip>
                )}
              </div>
            );
          })()}

        {/* Source — current head / base / unified-diff toggle for modified
            steps; otherwise the single available body. */}
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="font-mono text-[10px] tracking-wider whitespace-nowrap uppercase">
              <span className="text-zinc-600">Source</span>
              <span className="mx-1.5 tracking-normal text-zinc-700 normal-case">
                ·
              </span>
              <span className="tracking-normal text-zinc-400 normal-case">
                {prStatus === "deleted"
                  ? "base (previous)"
                  : SOURCE_VIEW_LABEL[effectiveView]}
              </span>
            </div>
            {canToggle && (
              <div
                role="radiogroup"
                aria-label="Source view"
                className="flex items-center gap-0.5 rounded-md border bg-zinc-900/60 p-0.5"
                style={{ borderColor: "hsl(220, 15%, 16%)" }}
              >
                {(["diff", "current"] as const).map((view) => {
                  const active = effectiveView === view;
                  return (
                    <button
                      key={view}
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSourceView(view)}
                      className={`rounded px-2.5 py-1 font-mono text-[11px] font-medium tracking-wide capitalize transition-colors ${
                        active
                          ? "bg-zinc-700/80 text-zinc-50 shadow-sm"
                          : "text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-200"
                      }`}
                    >
                      {view}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {/* Status framing — the change class is visible at the code
              itself, not just in the header pill (canonical palette):
              mint bar = added, rose bar = deleted (base body shown),
              amber note = modified but the base wasn't carried. */}
          {prStatus === "added" && (
            <div
              className="mb-1.5 border-l-[3px] pl-2 font-mono text-[10.5px]"
              style={{
                borderColor: STATUS_STYLES.added.border,
                color: STATUS_STYLES.added.text,
              }}
            >
              + added in this PR
            </div>
          )}
          {prStatus === "deleted" && (
            <div
              className="mb-1.5 border-l-[3px] pl-2 font-mono text-[10.5px]"
              style={{
                borderColor: STATUS_STYLES.deleted.border,
                color: STATUS_STYLES.deleted.text,
              }}
            >
              − removed in this PR — showing the base body
            </div>
          )}
          {prStatus === "modified" && !baseBody && (
            <div
              className="mb-1.5 border-l-[3px] pl-2 font-mono text-[10.5px]"
              style={{
                borderColor: STATUS_STYLES.modified.border,
                color: STATUS_STYLES.modified.text,
              }}
            >
              ~ modified in this PR — base version not carried in this report
            </div>
          )}
          {canToggle && effectiveView === "diff" ? (
            <div
              className="border-l-[3px] pl-0.5"
              style={{ borderColor: STATUS_STYLES.modified.border }}
            >
              <DiffBlock
                before={baseBody}
                after={headBody}
                lang={langFromFile(methodInfo?.filePath || step?.file)}
              />
            </div>
          ) : displayBody ? (
            <div
              className={prStatus === "added" || prStatus === "deleted" ? "border-l-[3px] pl-0.5" : undefined}
              style={
                prStatus === "added"
                  ? { borderColor: STATUS_STYLES.added.border }
                  : prStatus === "deleted"
                    ? { borderColor: STATUS_STYLES.deleted.border }
                    : undefined
              }
            >
              <CodeBlock
                code={displayBody}
                lang={langFromFile(methodInfo?.filePath || step?.file)}
              />
            </div>
          ) : (
            <div
              className="flex flex-col items-center gap-1.5 rounded-lg border px-3 py-6"
              style={{
                background: "var(--bpmn-bg-deep)",
                borderColor: "var(--bpmn-border-soft)",
              }}
            >
              <span className="font-mono text-xs text-zinc-400">
                Body not captured
              </span>
              <span className="font-mono text-[10px] text-zinc-600">
                Re-run analysis to include this method's source.
              </span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-zinc-800/60" />

        {/* Callers */}
        {functionData && functionData.calledBy.length > 0 && (
          <div>
            <button
              onClick={() => setCallersOpen((o) => !o)}
              className="mb-2 flex w-full items-center gap-1 font-mono text-[10px] tracking-wider text-zinc-600 uppercase transition-colors hover:text-zinc-400"
            >
              <ChevronRight
                className="h-3 w-3 transition-transform"
                style={{
                  transform: callersOpen ? "rotate(90deg)" : "rotate(0deg)",
                }}
              />
              <ArrowDownLeft className="h-3 w-3" />
              Called by ({functionData.calledBy.length})
            </button>
            {callersOpen && (
              <div className="space-y-1">
                {functionData.calledBy.map((callerId) => (
                  <button
                    key={callerId}
                    onClick={() => setActiveFunctionId(callerId, "chapter")}
                    className="w-full truncate rounded px-2 py-1 text-left font-mono text-[11px] text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-zinc-200"
                  >
                    {shortName(callerId)}
                    <span className="ml-1 text-[9px] text-zinc-700">
                      {callerId !== shortName(callerId) ? callerId : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Callees */}
        {functionData && functionData.calls.length > 0 && (
          <div>
            <button
              onClick={() => setCalleesOpen((o) => !o)}
              className="mb-2 flex w-full items-center gap-1 font-mono text-[10px] tracking-wider text-zinc-600 uppercase transition-colors hover:text-zinc-400"
            >
              <ChevronRight
                className="h-3 w-3 transition-transform"
                style={{
                  transform: calleesOpen ? "rotate(90deg)" : "rotate(0deg)",
                }}
              />
              <ArrowUpRight className="h-3 w-3" />
              Calls ({functionData.calls.length})
            </button>
            {calleesOpen && (
              <div className="space-y-1">
                {functionData.calls.map((calleeId) => (
                  <button
                    key={calleeId}
                    onClick={() => setActiveFunctionId(calleeId, "chapter")}
                    className="w-full truncate rounded px-2 py-1 text-left font-mono text-[11px] text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-zinc-200"
                  >
                    {shortName(calleeId)}
                    <span className="ml-1 text-[9px] text-zinc-700">
                      {calleeId !== shortName(calleeId) ? calleeId : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Cross-chapter references — this method also appears in these
            other journeys. Each row navigates to that journey. */}
        {crossChapters.length > 0 && (
          <div>
            <div className="mb-2 border-t border-zinc-800/60 pt-3" />
            <div className="mb-2 flex items-center gap-1 font-mono text-[10px] tracking-wider text-zinc-600 uppercase">
              <BookOpen className="h-3 w-3" />
              Also in ({crossChapters.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {crossChapters.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() =>
                    navigate(`/journeys/${encodeURIComponent(ch.slug)}`)
                  }
                  className="inline-flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1 font-mono text-[10px] text-zinc-400 transition-colors hover:border-zinc-600 hover:bg-zinc-800/80 hover:text-zinc-100"
                  title={`Open journey: ${ch.title}`}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: ch.color }}
                  />
                  <span className="max-w-[160px] truncate">{ch.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const MemoizedFunctionBodyPanelContent = memo(FunctionBodyPanelContent);

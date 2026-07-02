import FunctionBodyPanel from "@/components/journeys/FunctionBodyPanel";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { stripPRFromChapter } from "@/data/prModeFilter";
import { getPrOverview, getPROverlay, getMethodInfo } from "@/data/parity-loader";
import { bpmnExportFilename } from "@/lib/exportBpmnPng";
import { useJourneyUIStore } from "@/store/use-journey-ui-store";
import { Chapter, ChapterPRStatus } from "@/types/journey";
import type { BpmnElement } from "@/components/bpmn/types";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  GitPullRequest,
  Info,
  Maximize2,
  Minimize2,
  RotateCw,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { BpmnEditor, type BpmnCanvasHandle } from "./BpmnEditor";
import { BpmnStepFunctions } from "./BpmnStepFunctions";
import CallFlowChart from "./CallFlowChart";
import { JourneyOverview } from "./JourneyOverview";
import { useUIStore } from "@/store/use-ui-store";
import { useAnalysis } from "@/store/use-analysis-store";

/** Maps the classifier's `intentReclass` enum to a short human label.
 *  Kept in sync with the journey index. `true-addition`/`true-removal`
 *  pass through as the structural prStatus, so no override is shown. */
const RECLASS_LABEL: Record<string, string> = {
  "decorator-wrap": "decorator wrap",
  scaffolding: "DI wiring",
  "rename-or-move": "renamed",
  "behaviour-change": "behaviour change",
};

type DockPosition = "bottom" | "right" | "left";

const DOCK_KEY = "journey-dock-position";

function loadDockPosition(): DockPosition {
  try {
    const saved = localStorage.getItem(DOCK_KEY);
    if (saved === "right" || saved === "left" || saved === "bottom")
      return saved;
  } catch (e) {
    console.error(e);
  }
  return "bottom";
}

interface ChapterViewProps {
  chapterSlug: string;
  onBack: () => void;
}

const STATUS_BADGE: Record<ChapterPRStatus, { label: string; cls: string }> = {
  affected: {
    label: "affected",
    cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  added: {
    label: "new journey",
    cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  removed: {
    label: "removed",
    cls: "bg-red-500/15 text-red-400 border-red-500/30",
  },
  demoted: {
    label: "demoted",
    cls: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
};

const ChapterViewInner: React.FC<{ chapter: Chapter; onBack: () => void }> = ({
  chapter,
  onBack,
}) => {
  const activeFunctionId = useJourneyUIStore((state) => state.activeFunctionId);
  const location = useLocation();
  // Deep link ?view=bpmn opens the fullscreen business-flow diagram —
  // same surface the summary's expand button opens. (?view=flow is
  // handled by the `view` state below; absent → the summary page.)
  const [isFullscreen, setIsFullscreen] = useState(
    () =>
      new URLSearchParams(location.search).get("view") === "bpmn" &&
      !!chapter.bpmn,
  );
  const [dockPosition, setDockPositionState] =
    useState<DockPosition>(loadDockPosition);
  // The journey detail page LEADS with the summary (JourneyOverview),
  // which embeds the BPMN diagram prominently near the top. `view`
  // governs only the call-graph POPUP layered over that summary base:
  //   - "detail" — the summary page with embedded diagram (default)
  //   - "flow"   — the call-graph popup is open over the summary
  //
  // Deep links: ?view=bpmn opens the fullscreen diagram (handled by
  // `isFullscreen` above); ?view=flow opens the call graph.
  //
  // Desktop adaptation: under HashRouter the query string lives INSIDE
  // the hash (#/journeys/slug?view=flow), so window.location.search is
  // always empty — react-router's location.search is the hash-aware
  // source. One-shot read on mount (useState initializer).
  const [view, setView] = useState<"detail" | "flow">(() => {
    const wanted = new URLSearchParams(location.search).get("view");
    if (wanted === "flow") return "flow";
    return "detail";
  });
  const scrollRequestRef = useRef<string | null>(null);
  const bpmnCanvasRef = useRef<BpmnCanvasHandle | null>(null);
  const [exporting, setExporting] = useState(false);

  const onExportBpmn = useCallback(async () => {
    const handle = bpmnCanvasRef.current;
    if (!handle) return;
    setExporting(true);
    try {
      // Populate the engineering-drawing title block. The PR overlay
      // (if present) gives us a real PR id and base/head SHAs; without
      // it, the block falls back to just the journey title + date so
      // the export still stands on its own.
      const overlay = getPROverlay();
      const prSlug =
        overlay?.headRepo && overlay?.id
          ? `${overlay.headRepo}#${overlay.id.replace(/^#/, "")}`
          : overlay?.id;
      await handle.exportPng(bpmnExportFilename(chapter.title), {
        journeyTitle: chapter.title,
        prId: prSlug,
        baseSha: overlay?.baseSha,
        headSha: overlay?.headSha,
        generatedAt: new Date(),
      });
    } catch (err) {
      console.error("[bpmn-export] failed:", err);
    } finally {
      setExporting(false);
    }
  }, [chapter.title]);

  const setDockPosition = useCallback((pos: DockPosition) => {
    try {
      localStorage.setItem(DOCK_KEY, pos);
    } catch (e) {
      console.error(e);
    }
    setDockPositionState(pos);
  }, []);

  // Selected BPMN element + whether the functions dialog is OPEN.
  // Selection alone never opens it ("sometimes I just want to drag the
  // thing around") — a pill appears on selection and the dialog opens
  // only when asked. Declared up here for the Esc handler.
  const [bpmnElement, setBpmnElement] = useState<BpmnElement | null>(null);
  const [stepFnsOpen, setStepFnsOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (stepFnsOpen) setStepFnsOpen(false); // innermost first
        else if (view === "flow") setView("detail"); // close call-graph popup
        else if (bpmnElement) setBpmnElement(null); // clear selection
        else if (isFullscreen) setIsFullscreen(false);
        else onBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [stepFnsOpen, bpmnElement, view, isFullscreen, onBack]);

  // Expanded nodes — lifted here so the set survives fullscreen transitions.
  // Seeds with the root PLUS the ancestor chain of every PR-changed step:
  // in a PR review the changed path IS the content, and a collapsed tree
  // showing two nodes made the call-graph rail look broken. Unchanged
  // branches stay collapsed so the chunk budget holds.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const edges = chapter.edges.map((e: any) =>
      typeof e === "object" && "from" in e ? e : { from: e[0], to: e[1] }
    );
    const childMap: Record<string, string[]> = {};
    const seenEdge = new Set<string>();
    const hasParent = new Set<string>();
    for (const e of edges) {
      const key = e.from + " " + e.to;
      if (seenEdge.has(key)) continue;
      seenEdge.add(key);
      (childMap[e.from] ||= []).push(e.to);
      hasParent.add(e.to);
    }
    const root =
      chapter.functions.find((f) => !hasParent.has(f)) || chapter.functions[0];
    // Tree-parents via the same DFS the chart renders with.
    const treeParent = new Map<string, string>();
    const visited = new Set<string>();
    (function dfs(n: string) {
      visited.add(n);
      for (const c of childMap[n] || []) {
        if (visited.has(c)) continue;
        treeParent.set(c, n);
        dfs(c);
      }
    })(root);
    const seed = new Set([root]);
    for (const s of chapter.steps) {
      if (!s.prStatus || !s.fqn) continue;
      let cur: string | undefined = s.fqn;
      const guard = new Set<string>();
      while (cur && !guard.has(cur)) {
        guard.add(cur);
        const p = treeParent.get(cur);
        if (!p) break;
        seed.add(p);
        cur = p;
      }
    }
    return seed;
  });

  const toggleExpand = useCallback((fqn: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(fqn)) next.delete(fqn);
      else next.add(fqn);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpanded(new Set(chapter.functions));
  }, [chapter.functions]);

  const collapseAll = useCallback(() => {
    const edges = chapter.edges.map((e: any) =>
      typeof e === "object" && "from" in e ? e : { from: e[0], to: e[1] }
    );
    const hasParent = new Set(edges.map((e: any) => e.to));
    const root =
      chapter.functions.find((f) => !hasParent.has(f)) || chapter.functions[0];
    setExpanded(new Set([root]));
  }, [chapter.functions, chapter.edges]);

  const expandPath = useCallback(
    (fqn: string) => {
      const edges = chapter.edges.map((e: any) =>
        typeof e === "object" && "from" in e ? e : { from: e[0], to: e[1] }
      );
      // Mirror buildTree's DFS-from-root to derive each node's actual tree-parent.
      // A raw "last-edge-wins" parentMap disagreed with the rendered tree when a
      // node had multiple incoming edges, so expanding its "parent" left the
      // target hidden under a different branch.
      const childMap: Record<string, string[]> = {};
      const seenEdge = new Set<string>();
      const hasParent = new Set<string>();
      for (const e of edges) {
        const key = e.from + " " + e.to;
        if (seenEdge.has(key)) continue;
        seenEdge.add(key);
        if (!childMap[e.from]) childMap[e.from] = [];
        childMap[e.from].push(e.to);
        hasParent.add(e.to);
      }
      const root =
        chapter.functions.find((f) => !hasParent.has(f)) ||
        chapter.functions[0];
      const treeParent = new Map<string, string>();
      const visited = new Set<string>();
      (function dfs(n: string) {
        visited.add(n);
        for (const c of childMap[n] || []) {
          if (visited.has(c)) continue;
          treeParent.set(c, n);
          dfs(c);
        }
      })(root);

      setExpanded((prev) => {
        const next = new Set(prev);
        // Cycle-guarded just in case, though DFS-built treeParent is acyclic.
        const seen = new Set<string>();
        let cur: string | undefined = fqn;
        while (cur && !seen.has(cur)) {
          seen.add(cur);
          const p = treeParent.get(cur);
          if (!p) break;
          next.add(p);
          cur = p;
        }
        return next;
      });
    },
    [chapter.edges, chapter.functions]
  );

  // Non-toggling selection: the journey-UI store's setActiveFunctionId
  // TOGGLES (re-setting the current id clears it), which is right for
  // node clicks but wrong for programmatic navigation — jumping to the
  // already-active method must keep it open. Write the slice directly.
  const selectFunction = useCallback((fqn: string) => {
    useJourneyUIStore.setState({
      activeFunctionId: fqn,
      interactionSource: "chapter",
    });
  }, []);

  // Code surfaces in the docked panel in the call-graph popup only. The
  // Overview page is a reading surface — no code references there. In
  // the business flow, code lives in the step-functions rail (on demand).
  const codePaneVisible = !!activeFunctionId && view === "flow";
  const prStatus = chapter.prStatus;
  const prBadge = prStatus ? STATUS_BADGE[prStatus] : null;
  const changedStepCount = useMemo(
    () => chapter.steps.filter((s) => s.prStatus).length,
    [chapter.steps]
  );

  // --- Finding navigation ---
  const findingFqns = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const s of chapter.steps) {
      if (s.findings?.length && s.fqn && !seen.has(s.fqn)) {
        seen.add(s.fqn);
        out.push(s.fqn);
      }
    }
    return out;
  }, [chapter.steps]);

  const [findingNavIdx, setFindingNavIdx] = useState(0);

  useEffect(() => {
    if (!activeFunctionId) return;
    const idx = findingFqns.indexOf(activeFunctionId);
    if (idx >= 0) setFindingNavIdx(idx);
  }, [activeFunctionId, findingFqns]);

  const navigateFinding = useCallback(
    (direction: "next" | "prev") => {
      if (findingFqns.length === 0) return;
      const newIdx =
        direction === "next"
          ? (findingNavIdx + 1) % findingFqns.length
          : (findingNavIdx - 1 + findingFqns.length) % findingFqns.length;
      setFindingNavIdx(newIdx);
      const fqn = findingFqns[newIdx];
      expandPath(fqn);
      scrollRequestRef.current = fqn;
      selectFunction(fqn);
    },
    [findingFqns, findingNavIdx, expandPath, selectFunction]
  );

  // Ordered list of PR-changed method fqns, used by the top-bar nav arrows.
  const prChangedFqns = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of chapter.steps) {
      if (s.prStatus && s.fqn && !seen.has(s.fqn)) {
        seen.add(s.fqn);
        out.push(s.fqn);
      }
    }
    return out;
  }, [chapter.steps]);

  const [prNavIdx, setPrNavIdx] = useState(0);
  // Keep the cursor pointing at the active method when the user clicks a
  // different PR-changed node directly, so next/prev continue from there.
  useEffect(() => {
    if (!activeFunctionId) return;
    const idx = prChangedFqns.indexOf(activeFunctionId);
    if (idx >= 0) setPrNavIdx(idx);
  }, [activeFunctionId, prChangedFqns]);

  const navigatePR = useCallback(
    (direction: "next" | "prev") => {
      if (prChangedFqns.length === 0) return;
      const newIdx =
        direction === "next"
          ? (prNavIdx + 1) % prChangedFqns.length
          : (prNavIdx - 1 + prChangedFqns.length) % prChangedFqns.length;
      setPrNavIdx(newIdx);
      const fqn = prChangedFqns[newIdx];
      expandPath(fqn);
      scrollRequestRef.current = fqn;
      selectFunction(fqn);
    },
    [prChangedFqns, prNavIdx, expandPath, selectFunction]
  );

  // BPMN selection → the step-functions rail. The flow view shows NO
  // call graph and opens no code panel: selecting a step LISTS the
  // functions that implement it (one lens strip each, code on demand —
  // the Drift Map pattern). The call graph is its own view, entered
  // from the Overview cards; the two are cross-linked, not interleaved.
  // Reverse link: from the call graph's code panel, "part of step X"
  // jumps INTO the business flow with that step's functions listed.
  const onJumpToFlowStep = useCallback((element: BpmnElement) => {
    setBpmnElement(element);
    setStepFnsOpen(true);
    setView("detail");
  }, []);

  // Forward link: from a step's function strip, "call graph beneath" —
  // SWAP contexts instead of stacking a third popup: close the step
  // dialog, open the call-graph popup with the function's subtree
  // expanded, scrolled to, and its source open below. The code panel's
  // "step:" chip is the symmetric way back.
  const onOpenCallGraphAt = useCallback(
    (fqn: string) => {
      setStepFnsOpen(false);
      expandPath(fqn);
      scrollRequestRef.current = fqn;
      selectFunction(fqn);
      setView("flow");
    },
    [expandPath, selectFunction]
  );

  // Adapter for the JourneyOverview's drill-in buttons. The diagram is the
  // inline base; "business flow" opens the existing fullscreen popup,
  // "call graph" opens the call-graph popup.
  const onOpenView = useCallback((target: "bpmn" | "flow") => {
    if (target === "flow") setView("flow");
    else setIsFullscreen(true);
  }, []);

  // Inline business-flow diagram — the PRIMARY content of the journey
  // page now. The reader looks at the BPMN directly instead of wading
  // through prose; the step-functions dialog overlays it (code on
  // demand). `compact` drops the inline header chrome + narrative in
  // fullscreen so the diagram fills the screen.
  const inlineBpmn = (compact: boolean) => (
    <div className="flex h-full flex-col" style={{ background: "var(--bpmn-bg)" }}>
      {!compact && (
        <>
          {/* eyebrow + display title + stats, export on the right */}
          <div className="flex shrink-0 items-center gap-4 pt-3 pb-2.5 pl-6 pr-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Workflow
                  className="h-3 w-3"
                  style={{ color: "var(--bpmn-mint)" }}
                />
                <span
                  className="font-mono text-[9px] uppercase"
                  style={{ color: "var(--bpmn-mint)", letterSpacing: 3 }}
                >
                  business flow
                </span>
                <span
                  className="font-mono text-[9.5px]"
                  style={{ color: "var(--bpmn-text-dim)" }}
                >
                  {chapter.bpmn?.elements?.length ?? 0} steps ·{" "}
                  {chapter.bpmn?.flows?.length ?? 0} paths
                </span>
              </div>
            </div>
            {chapter.bpmnValidation && (
              <span
                className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 font-mono text-[10px] ${
                  chapter.bpmnValidation.verdict === "errors"
                    ? "border-red-700/30 bg-red-500/10 text-red-700"
                    : chapter.bpmnValidation.verdict === "warnings"
                      ? "border-amber-700/30 bg-amber-500/10 text-amber-700"
                      : "border-emerald-700/30 bg-emerald-500/10 text-emerald-700"
                }`}
                title={
                  chapter.bpmnValidation.issues.length === 0
                    ? "BPMN verified — every claim cross-checked against source."
                    : chapter.bpmnValidation.issues
                        .map((i) => `${i.severity}: ${i.claim}`)
                        .join("\n")
                }
              >
                {chapter.bpmnValidation.verdict === "ok"
                  ? "✓ verified"
                  : `${chapter.bpmnValidation.issues.length} ${chapter.bpmnValidation.verdict}`}
              </span>
            )}
            <button
              onClick={() => setIsFullscreen(true)}
              title="Fullscreen the business flow (Esc to exit)"
              aria-label="Fullscreen the business flow"
              className="shrink-0 rounded-lg p-2 transition-colors"
              style={{ color: "var(--bpmn-text-dim)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--bpmn-text)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--bpmn-text-dim)";
              }}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onExportBpmn}
              disabled={exporting}
              title="Download as PNG (engineering-paper export)"
              className="shrink-0 rounded-lg p-2 transition-colors disabled:cursor-wait disabled:opacity-50"
              style={{ color: "var(--bpmn-text-dim)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--bpmn-text)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--bpmn-text-dim)";
              }}
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* gradient hairline under the header */}
          <div
            aria-hidden
            className="mx-6 shrink-0"
            style={{
              height: 1,
              background:
                "linear-gradient(90deg, rgba(46,125,91,0.5), rgba(46,125,91,0.08) 35%, rgba(29,111,143,0.08) 65%, rgba(29,111,143,0.45))",
            }}
          />
        </>
      )}
      {/* Honest-uncertainty banner (#9). `synthetic` is set only on the
          deterministic call-trace fallback (synthBpmnFromTrace) — never on
          the AI diagram. When the analyzer /bpmn call failed/timed-out the
          journey ships diagram-less and we render raw method names; say so
          plainly above the diagram so it never masquerades as the AI flow.
          To wire a single-journey regenerate, see
          backend/src/underscore_cli/force_bpmn.clj (no IPC exists yet). */}
      {chapter.bpmn?.synthetic && (
        <div
          className="flex shrink-0 items-center gap-2 border-amber-700/30 bg-amber-500/10 px-6 py-2 font-mono text-[10.5px] text-amber-700"
          style={{ borderBottom: "1px solid" }}
        >
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>
            AI business-flow diagram unavailable — showing raw call trace.
          </span>
        </div>
      )}
      <div className="bpmn-popup-canvas relative min-h-0 flex-1">
        <BpmnEditor
          ref={bpmnCanvasRef}
          diagram={chapter.bpmn!}
          chapter={chapter}
          height="100%"
          onSelectedElementChange={setBpmnElement}
        />
        {bpmnElement && stepFnsOpen ? (
          <div
            className="absolute inset-0 z-30 flex items-center justify-center p-6"
            role="dialog"
            aria-modal="true"
            aria-label={`Functions implementing: ${bpmnElement.label}`}
            style={{
              background: "rgba(46, 38, 24, 0.4)",
              backdropFilter: "blur(3px)",
            }}
            onClick={() => setStepFnsOpen(false)}
          >
            <div
              className="code-drawer-enter flex"
              style={{ width: "min(760px, 92%)", maxHeight: "84%" }}
              onClick={(e) => e.stopPropagation()}
            >
              <BpmnStepFunctions
                element={bpmnElement}
                chapter={chapter}
                onClose={() => setStepFnsOpen(false)}
                onOpenCallGraph={onOpenCallGraphAt}
              />
            </div>
          </div>
        ) : bpmnElement ? (
          /* selection made — offer the code, don't force it */
          <button
            onClick={() => setStepFnsOpen(true)}
            className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 font-mono text-[11px] transition-colors"
            style={{
              color: "var(--bpmn-mint)",
              border:
                "1px solid color-mix(in srgb, var(--bpmn-mint) 45%, transparent)",
              background:
                "color-mix(in srgb, var(--bpmn-bg-deep) 85%, transparent)",
              backdropFilter: "blur(10px)",
              boxShadow: "0 6px 20px rgb(60 50 30 / 0.18)",
            }}
            title="Open the functions implementing this step (code on demand)"
          >
            <span className="bpmn-hint-dot" />
            view the code behind “
            {bpmnElement.label.length > 42
              ? bpmnElement.label.slice(0, 42) + "…"
              : bpmnElement.label}
            ”
          </button>
        ) : (
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full px-3.5 py-1.5 font-mono text-[10.5px]"
            style={{
              color: "var(--bpmn-text-muted)",
              border:
                "1px solid color-mix(in srgb, var(--bpmn-mint) 22%, transparent)",
              background:
                "color-mix(in srgb, var(--bpmn-bg-deep) 78%, transparent)",
              backdropFilter: "blur(10px)",
            }}
          >
            <span className="bpmn-hint-dot" />
            select any step — its functions open here, code one click deeper
          </div>
        )}
      </div>
    </div>
  );

  // No-diagram state — trivial / over-cap / on-demand journeys have no
  // BPMN. Lead with the narrative + a tasteful note instead of crashing.
  const noDiagram = (
    <div
      className="flex shrink-0 items-center gap-2.5 px-6 pt-4 pb-3"
      style={{ color: "var(--bpmn-text-dim)" }}
    >
      <Workflow className="h-3.5 w-3.5" />
      <span className="font-mono text-[11px]">
        No business-flow diagram for this journey — read the steps below.
      </span>
    </div>
  );

  const makeCanvas = (compact: boolean) => (
    <div
      className="relative h-full overflow-hidden"
      style={{ background: "var(--bpmn-bg)" }}
    >
      {/* OVERVIEW-FIRST — selecting a journey LANDS on the overview (PR
          narrative + hub + neighbors), prominent at the top of the
          viewport. The interactive business-flow diagram lives in a
          bounded section BELOW it on one scrollable page; it keeps full
          interaction (select a step → BpmnStepFunctions / code on demand,
          and the "call graph" affordance opens the call/code graph via
          flowPopup). No diagram → overview only. */}
      <div className="h-full overflow-y-auto">
        {chapter.bpmn ? (
          <>
            {/* 1 — the overview is the landing, at natural height */}
            <JourneyOverview chapter={chapter} onOpenView={onOpenView} embedded />

            {/* 2 — the interactive business flow, a bounded section below */}
            <div
              className="border-t"
              style={{ borderColor: "var(--bpmn-border-soft)" }}
            >
              {/* The header (eyebrow + stats + verify badge + fullscreen +
                  export) lives inside inlineBpmn() — a separate header here is
                  what produced the duplicate "business flow" heading. */}
              <div
                className="mx-6 mb-4 h-[560px] min-h-0 overflow-hidden rounded-lg border"
                style={{ borderColor: "var(--bpmn-border-soft)" }}
              >
                {inlineBpmn(compact)}
              </div>
            </div>
          </>
        ) : (
          <>
            {noDiagram}
            <JourneyOverview chapter={chapter} onOpenView={onOpenView} />
          </>
        )}
      </div>

      {flowPopup(compact)}
    </div>
  );

  // key on the active FQN so the rise animation replays when the user
  // moves between methods, not just on first open.
  const codePane = (
    <div key={activeFunctionId ?? "none"} className="code-drawer-enter h-full">
      <FunctionBodyPanel
        chapter={chapter}
        dockPosition={dockPosition}
        onDockChange={setDockPosition}
        onJumpToFlowStep={onJumpToFlowStep}
      />
    </div>
  );

  // The call-graph chart + the docked code pane, INSIDE the call-graph
  // popup. key={dockPosition} remounts the group cleanly when dock
  // direction changes; stable panel ids keep react-resizable-panels
  // tracking the canvas across the codePane toggle.
  const flowChart = (compact: boolean) => (
    <CallFlowChart
      chapter={chapter}
      compact={compact}
      expanded={expanded}
      onToggleExpand={toggleExpand}
      onExpandAll={expandAll}
      onCollapseAll={collapseAll}
      scrollRequestRef={scrollRequestRef}
    />
  );
  const flowDockLayout = (compact: boolean) => (
    <div key={dockPosition} className="h-full">
      {dockPosition === "bottom" && (
        <ResizablePanelGroup orientation="vertical">
          <ResizablePanel id="canvas" minSize={30}>
            {flowChart(compact)}
          </ResizablePanel>
          {codePaneVisible && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel id="code" defaultSize={38} minSize={250}>
                {codePane}
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      )}
      {dockPosition === "right" && (
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel id="canvas" minSize={35}>
            {flowChart(compact)}
          </ResizablePanel>
          {codePaneVisible && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel id="code" defaultSize={36} minSize={300}>
                {codePane}
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      )}
      {dockPosition === "left" && (
        <ResizablePanelGroup orientation="horizontal">
          {codePaneVisible && (
            <>
              <ResizablePanel id="code" defaultSize={36} minSize={300}>
                {codePane}
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}
          <ResizablePanel id="canvas" minSize={35}>
            {flowChart(compact)}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );

  // The call-graph POPUP, layered over whatever the base surface is
  // (the inline summary, or the fullscreen diagram). Self-contained so
  // both bases can mount it.
  const flowPopup = (compact: boolean) =>
    view === "flow" && (
      <div
        className="absolute inset-0 z-30 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label={`Call graph: ${chapter.title}`}
        style={{
          background: "rgba(0, 0, 0, 0.55)",
          backdropFilter: "blur(3px)",
        }}
        onClick={() => setView("detail")}
      >
        {/* Tokenized — follows paper/dark with everything else. */}
        <div
          className="code-drawer-enter relative flex flex-col overflow-hidden rounded-xl"
          style={{
            width: "96%",
            height: "94%",
            background: "var(--bpmn-bg-deep)",
            border: "1px solid var(--bpmn-border-em)",
            boxShadow: "0 24px 70px rgb(0 0 0 / 0.35)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex shrink-0 items-center gap-2.5 px-4 py-2.5"
            style={{ borderBottom: "1px solid var(--bpmn-border-soft)" }}
          >
            <span
              aria-hidden
              className="text-[12px] leading-none"
              style={{ color: "var(--bpmn-cyan)" }}
            >
              ⌁
            </span>
            <span
              className="font-mono text-[11px]"
              style={{ color: "var(--bpmn-cyan)" }}
            >
              call graph
            </span>
            <span
              className="truncate font-mono text-[11px]"
              style={{ color: "var(--bpmn-text-dim)" }}
            >
              {chapter.title}
            </span>
            <button
              onClick={() => setView("detail")}
              aria-label="Close call graph"
              title="Close (Esc)"
              className="ml-auto rounded-md p-1.5 transition-colors"
              style={{ color: "var(--bpmn-text-dim)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--bpmn-text)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--bpmn-text-dim)";
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1">{flowDockLayout(compact)}</div>
        </div>
      </div>
    );

  // The popups carry their own inner layouts now — the outer shell is
  // just the canvas (overview + overlays).
  const makeInnerLayout = (compact: boolean) => makeCanvas(compact);

  if (isFullscreen) {
    return (
      <div className="relative h-full" style={{ background: "var(--bpmn-bg)" }}>
        {/* Floating exit control */}
        <div className="absolute top-3 right-3 z-10">
          <button
            onClick={() => setIsFullscreen(false)}
            title="Exit fullscreen (Esc)"
            className="rounded-md border border-zinc-800/60 bg-zinc-900/80 p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* Fullscreen LEADS with the diagram (unchanged behaviour) — the
            expand button + ?view=bpmn land here. No diagram → the summary
            base. The call-graph popup layers over either. */}
        {chapter.bpmn ? (
          <div className="relative h-full">
            {inlineBpmn(true)}
            {flowPopup(true)}
          </div>
        ) : (
          makeInnerLayout(true)
        )}
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col"
      style={{ background: "var(--page-bg)" }}
    >
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800/60 px-4 py-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="font-mono text-xs">Index</span>
        </button>
        <div className="h-4 w-px bg-zinc-800" />
        <div
          className="h-2 w-2 flex-shrink-0 rounded-full"
          style={{ backgroundColor: chapter.color }}
        />
        <span
          className="truncate text-zinc-100"
          style={{
            fontFamily: "var(--bpmn-font-display)",
            fontSize: 15,
            fontStyle: "italic",
            letterSpacing: 0.2,
            maxWidth: "38vw",
          }}
        >
          {chapter.title}
        </span>
        {chapter.summary && (
          <div className="group relative">
            <Info className="h-3.5 w-3.5 cursor-help text-zinc-500 hover:text-zinc-300" />
            <div
              role="tooltip"
              className="invisible absolute left-0 top-full z-30 mt-1 w-[28rem] max-w-[80vw] rounded-md border border-zinc-700 bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-300 opacity-0 shadow-xl transition-opacity group-hover:visible group-hover:opacity-100"
            >
              {chapter.summary}
            </div>
          </div>
        )}
        {/* spacer — the "N phases · M methods" counter was noise
            ("20 phases is not good; I don't need it") */}
        <span className="ml-auto" />
        {prBadge && (
          <span
            className={`flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-xs ${prBadge.cls}`}
            title="PR status — per-step details shown inline in the flow"
          >
            <GitPullRequest className="h-3 w-3" />
            {prBadge.label}
            {changedStepCount > 0 && (
              <span className="text-[10px] opacity-70">
                · {changedStepCount}
              </span>
            )}
          </span>
        )}
        {chapter.reviewSummary && (
          <span
            className={`flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-xs ${
              chapter.reviewSummary.risk === "high"
                ? "border-red-500/30 bg-red-500/10 text-red-400"
                : chapter.reviewSummary.risk === "medium"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            }`}
            title={chapter.reviewSummary.narrative}
          >
            {chapter.reviewSummary.findingCount} findings ·{" "}
            {chapter.reviewSummary.risk} risk
          </span>
        )}
        {/* Step-through navs — call-graph concerns only (they expand the
            graph and open code). One bordered pill each, horizontal ‹ ›
            so they read as back/forward. Hidden on overview + flow views
            where they have nothing to drive. */}
        {view === "flow" && findingFqns.length > 0 && (
          <div
            className="ml-1 flex items-center overflow-hidden rounded-md border"
            style={{ borderColor: "rgba(245,158,11,0.25)" }}
            title="Step through review findings"
          >
            <button
              onClick={() => navigateFinding("prev")}
              aria-label="Previous finding"
              className="px-1.5 py-1 text-amber-500/60 transition-colors hover:bg-amber-900/30 hover:text-amber-400"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span
              className="px-0.5 text-center font-mono text-[10.5px] text-amber-500/70 tabular-nums"
              style={{ minWidth: 40 }}
            >
              ⚠ {findingNavIdx + 1}/{findingFqns.length}
            </span>
            <button
              onClick={() => navigateFinding("next")}
              aria-label="Next finding"
              className="px-1.5 py-1 text-amber-500/60 transition-colors hover:bg-amber-900/30 hover:text-amber-400"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {view === "flow" && prChangedFqns.length > 0 && (
          <div
            className="ml-1 flex items-center overflow-hidden rounded-md border border-zinc-800"
            title="Step through this PR's changed methods"
          >
            <button
              onClick={() => navigatePR("prev")}
              aria-label="Previous change"
              className="px-1.5 py-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span
              className="px-0.5 text-center font-mono text-[10.5px] text-zinc-400 tabular-nums"
              style={{ minWidth: 40 }}
            >
              Δ {prNavIdx + 1}/{prChangedFqns.length}
            </span>
            <button
              onClick={() => navigatePR("next")}
              aria-label="Next change"
              className="px-1.5 py-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {/* Call graph — the diagram is the inline base; the call graph is
            its sibling POPUP, one labeled click away from the page header
            (the overview's "code map" button now lives in the collapsed
            narrative below). When open, this becomes a breadcrumb. */}
        {view === "flow" ? (
          <div className="ml-1 flex items-center gap-1.5">
            <button
              onClick={() => setView("detail")}
              title="Back to the business-flow diagram"
              className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/70 px-2.5 py-1 font-mono text-[11px] text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
            >
              <ArrowLeft className="h-3 w-3" />
              diagram
            </button>
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-300/90">
              <span aria-hidden className="text-[11px] leading-none">
                ⌁
              </span>{" "}
              call graph
            </span>
          </div>
        ) : (
          <button
            onClick={() => setView("flow")}
            title="The code map — every call this journey makes, with source"
            className="ml-1 flex items-center gap-1.5 rounded-md border border-zinc-800 px-2.5 py-1 font-mono text-[11px] text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            <span aria-hidden className="text-[12px] leading-none">
              ⌁
            </span>
            call graph
          </button>
        )}
        {/* Export + validation moved INTO the business-flow popup header —
            the popup is self-contained; the page header stays clean. */}
        {/* Labeled — the icon-only 14px version was effectively
            undiscoverable ("the diagram cannot be expanded"). */}
        <button
          onClick={() => setIsFullscreen(true)}
          title="Fullscreen — hides header (Esc to exit)"
          className="flex items-center gap-1.5 rounded-md border border-zinc-800 px-2.5 py-1 font-mono text-[11px] text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
        >
          <Maximize2 className="h-3 w-3" />
          expand
        </button>
      </div>

      {/* Intent banner — surfaces the AI classifier's reasoning for this
          journey. Primary journeys get a cyan banner with the rationale
          and any reclassification badge; secondary journeys get a slate
          banner; noise gets a tiny muted banner. Hidden entirely when
          the classifier didn't run (intentCategory absent). */}
      {chapter.intentCategory &&
        (chapter.intentWhy || chapter.intentReclass) &&
        (() => {
          const reclassLabel = chapter.intentReclass
            ? RECLASS_LABEL[chapter.intentReclass]
            : null;
          const isPrimary = chapter.intentCategory === "primary";
          const isSecondary = chapter.intentCategory === "secondary";
          const isNoise = chapter.intentCategory === "noise";
          const wrap = isPrimary
            ? "border-b border-cyan-500/30 bg-gradient-to-r from-cyan-950/30 via-cyan-950/15 to-transparent"
            : isSecondary
              ? "border-b border-slate-700/60 bg-slate-900/40"
              : "border-b border-zinc-800/60 bg-zinc-900/30";
          const labelText = isPrimary
            ? "Primary"
            : isSecondary
              ? "Secondary"
              : "Structural noise";
          const labelCls = isPrimary
            ? "text-cyan-300 border-cyan-400/40 bg-cyan-500/15"
            : isSecondary
              ? "text-slate-300 border-slate-600/60 bg-slate-700/40"
              : "text-zinc-400 border-zinc-700/60 bg-zinc-800/40";
          const whyCls = isPrimary
            ? "text-cyan-100/90"
            : isSecondary
              ? "text-slate-300"
              : "text-zinc-400 italic";
          return (
            <div className={`flex shrink-0 items-start gap-3 px-4 py-2 ${wrap}`}>
              <span
                title={
                  isPrimary
                    ? "Directly implements PR intent"
                    : isSecondary
                      ? "Supporting change required by primary journeys"
                      : "Structurally flagged by diff but semantically inert"
                }
                className={`mt-0.5 inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${labelCls}`}
              >
                {isPrimary && <Sparkles className="h-2.5 w-2.5" />}
                {isNoise && !isPrimary && <Info className="h-2.5 w-2.5" />}
                {labelText}
              </span>
              {reclassLabel && (
                <span
                  title="The structural prStatus alone is misleading — this label names the actual change."
                  className="mt-0.5 inline-flex items-center gap-1 rounded-sm border border-slate-600/60 bg-slate-700/30 px-1.5 py-0.5 font-mono text-[10px] text-slate-300"
                >
                  <RotateCw className="h-2.5 w-2.5" />
                  {reclassLabel}
                </span>
              )}
              {chapter.intentWhy && (
                <p className={`flex-1 text-xs leading-snug ${whyCls}`}>
                  {chapter.intentWhy}
                </p>
              )}
            </div>
          );
        })()}

      {/* Main content — no outer split needed now that Narrative is removed */}
      <div className="min-h-0 flex-1">{makeInnerLayout(false)}</div>
    </div>
  );
};

const ChapterView: React.FC<ChapterViewProps> = ({ chapterSlug, onBack }) => {
  const transformedData = useAnalysis((state) => state.transformedData);

  const rawChapter = useMemo(
    () =>
      transformedData?.chapters?.find((c) => c.slug === chapterSlug) || null,
    [chapterSlug, transformedData?.chapters]
  );

  const prMode = useUIStore((state) => state.prMode);

  const chapter = useMemo(
    () =>
      rawChapter
        ? prMode
          ? rawChapter
          : stripPRFromChapter(rawChapter)
        : null,
    [rawChapter, prMode]
  );

  if (!chapter) {
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{ background: "var(--page-bg)" }}
      >
        <div className="text-sm text-zinc-500">
          Journey not found.{" "}
          <button onClick={onBack} className="text-zinc-300 underline">
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (!prMode && rawChapter?.prStatus === "removed") {
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{ background: "var(--page-bg)" }}
      >
        <div className="text-center">
          <div className="mb-1.5 text-sm text-zinc-400">
            This journey does not exist in HEAD.
          </div>
          <div className="mb-4 text-xs text-zinc-600">
            Switch back to PR view to see it.
          </div>
          <button
            onClick={onBack}
            className="font-mono text-xs text-zinc-300 underline underline-offset-2 hover:text-zinc-100"
          >
            Back to Index
          </button>
        </div>
      </div>
    );
  }

  // Keyed by journey id: the inner view's one-shot state (?view= deep
  // link read, expanded-node seeding, BPMN selection) must re-initialize
  // when the user crosses to ANOTHER journey via the overview's neighbor
  // cards — otherwise `?view=bpmn` deep links land on a stale view and
  // the call-graph seed belongs to the previous chapter.
  return <ChapterViewInner key={chapter.id} chapter={chapter} onBack={onBack} />;
};

export default ChapterView;

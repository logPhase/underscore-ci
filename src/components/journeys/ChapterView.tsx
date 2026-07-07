import FunctionBodyPanel from "@/components/journeys/FunctionBodyPanel";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { stripPRFromChapter } from "@/data/prModeFilter";
import { getPROverlay, getMethodInfo } from "@/data/parity-loader";
import { bpmnExportFilename } from "@/lib/exportBpmnPng";
import {
  normalizeEdges,
  deriveRoots,
  deriveTreeParents,
} from "@/lib/callgraph/forest";
import { STATUS_STYLES } from "@/lib/status-colors";
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
import { JourneyIntro } from "./JourneyIntro";
import { useUIStore } from "@/store/use-ui-store";
import { useAnalysis } from "@/store/use-analysis-store";
import { AskPanel } from "@/components/journeys/AskPanel";
import { CodePanel } from "@/components/journeys/CodePanel";
import { useCodeView } from "@/components/journeys/code-view-store";

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

// Canonical status palette (src/lib/status-colors.ts): amber = touched,
// green = new, red = removed — consistent with the call graph and BPMN.
const STATUS_BADGE: Record<ChapterPRStatus, { label: string; style: React.CSSProperties }> = {
  affected: {
    label: "affected",
    style: {
      background: STATUS_STYLES.affected.bg,
      color: STATUS_STYLES.affected.text,
      borderColor: STATUS_STYLES.affected.border,
    },
  },
  added: {
    label: "new journey",
    style: {
      background: STATUS_STYLES.added.bg,
      color: STATUS_STYLES.added.text,
      borderColor: STATUS_STYLES.added.border,
    },
  },
  removed: {
    label: "removed",
    style: {
      background: STATUS_STYLES.removed.bg,
      color: STATUS_STYLES.removed.text,
      borderColor: STATUS_STYLES.removed.border,
    },
  },
  demoted: {
    label: "demoted",
    style: {
      background: STATUS_STYLES.disconnected.bg,
      color: STATUS_STYLES.disconnected.text,
      borderColor: STATUS_STYLES.disconnected.border,
    },
  },
};

const ChapterViewInner: React.FC<{ chapter: Chapter; onBack: () => void }> = ({
  chapter,
  onBack,
}) => {
  const activeFunctionId = useJourneyUIStore((state) => state.activeFunctionId);
  const location = useLocation();
  const [dockPosition, setDockPositionState] =
    useState<DockPosition>(loadDockPosition);
  // The journey page reads top-to-bottom: intro (description +
  // connections), then the framed diagram. `view` governs only the
  // call-graph POPUP layered over that base:
  //   - "detail" — the page (default)
  //   - "flow"   — the call-graph popup is open over it
  //
  // Deep link: ?view=flow opens the call graph. (?view=bpmn — the old
  // fullscreen diagram — is retired; such links simply land on the page,
  // whose diagram is already the centerpiece.)
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

  // Right-edge code dock — shared with AskPanel via the code-view store
  // (only one of the two right panels open at a time). `codeWidth` also
  // drives the centered step-functions dialog so the chosen width sticks.
  const rightDock = useCodeView((s) => s.rightDock);
  const setRightDock = useCodeView((s) => s.setRightDock);
  const codeWidth = useCodeView((s) => s.width);

  // Deselecting a step tears down the code dock — the panel is
  // selection-gated, so a lingering "code" dock state would auto-open on
  // the next selection instead of waiting for a click. (Also fires on
  // mount when arriving at a fresh journey with the store left on "code".)
  useEffect(() => {
    if (!bpmnElement && rightDock === "code") setRightDock(null);
  }, [bpmnElement, rightDock, setRightDock]);

  // Double-clicking a step opens its code directly (founder ask). Resolve
  // the element straight from the diagram so we don't race the selection
  // callback; skip codeless steps (start/end events cite no functions).
  const openCodeForElement = useCallback(
    (elementId: string) => {
      const el =
        chapter.bpmn?.elements?.find((e) => e.id === elementId) ?? null;
      const hasCode =
        !!el &&
        (((el.code_evidence?.length ?? 0) > 0) ||
          ((el.code_fqns?.length ?? 0) > 0));
      if (!el || !hasCode) return;
      setBpmnElement(el);
      setRightDock("code");
    },
    [chapter.bpmn, setRightDock]
  );

  // Ask AI grounding — session/repo keys baked into the payload, plus the
  // journey's steps with their source (same shape the desktop sends). The
  // panel itself self-gates: it renders nothing when no /ask relay is
  // derivable from the report URL (file:// artifacts).
  const askSessionId =
    useAnalysis((s) => s.transformedData?.sessionId) ?? undefined;
  const askRepoId =
    useAnalysis((s) => s.transformedData?.analyzerRepoId) ?? undefined;
  const askJourney = useMemo(
    () => ({
      title: chapter.title,
      steps: chapter.steps.map((s) => ({
        fqn: s.fqn,
        source: s.body || getMethodInfo(s.fqn)?.body,
      })),
    }),
    [chapter]
  );

  // Esc escape-stack. Registered on the CAPTURE phase so it runs before
  // BpmnCanvas's own bubble-phase Esc (which clears node selection) — that
  // ordering is what lets the two coordinate instead of fighting:
  //   - Peeling an OUTER layer (step-functions dialog, call-graph popup)
  //     must not ALSO clear the selection underneath, so we preventDefault()
  //     and BpmnCanvas bails on defaultPrevented (one Esc = one layer).
  //   - Clearing a bare selection is BpmnCanvas's job (it owns the ring and
  //     the pill's source of truth), so we leave the event alone for it.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Don't hijack Esc from a focused text field (the inline label
      // editor) — that must cancel the edit, not navigate.
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      if (stepFnsOpen) {
        setStepFnsOpen(false); // innermost dialog first — keep selection
        e.preventDefault();
      } else if (rightDock) {
        // Minimize an open right dock (Ask AI / Code) — keep selection, and
        // don't let Esc fall through to onBack while a panel is open.
        setRightDock(null);
        e.preventDefault();
      } else if (view === "flow") {
        setView("detail"); // close call-graph popup — keep selection
        e.preventDefault();
      } else if (bpmnElement) {
        // BpmnCanvas clears its own selection → propagates to bpmnElement.
      } else {
        onBack();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [stepFnsOpen, bpmnElement, view, onBack, rightDock, setRightDock]);

  // Expanded nodes — lifted here so the set survives fullscreen transitions.
  // Seeds with the root PLUS the ancestor chain of every PR-changed step:
  // in a PR review the changed path IS the content, and a collapsed tree
  // showing two nodes made the call-graph rail look broken. Unchanged
  // branches stay collapsed so the chunk budget holds.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const edges = normalizeEdges(chapter.edges as unknown[]);
    // Same forest derivation the chart renders with (shared lib): seed with
    // EVERY root plus the ancestor chain of each PR-changed step — the
    // changed path IS the content in a PR review.
    const roots = deriveRoots(chapter.functions, edges);
    const treeParent = deriveTreeParents(chapter.functions, edges);
    const seed = new Set<string>(roots);
    for (const st of chapter.steps) {
      if (!st.prStatus || !st.fqn) continue;
      let cur: string | undefined = st.fqn;
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
    const edges = normalizeEdges(chapter.edges as unknown[]);
    setExpanded(new Set(deriveRoots(chapter.functions, edges)));
  }, [chapter.functions, chapter.edges]);

  const expandPath = useCallback(
    (fqn: string) => {
      const edges = normalizeEdges(chapter.edges as unknown[]);
      // Shared forest derivation — expanding a node's ancestors always
      // matches the rendered tree, whichever root its component hangs from.
      const treeParent = deriveTreeParents(chapter.functions, edges);
      setExpanded((prev) => {
        const next = new Set(prev);
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
      setRightDock(null); // close the docked code panel — call graph takes over
      expandPath(fqn);
      scrollRequestRef.current = fqn;
      selectFunction(fqn);
      setView("flow");
    },
    [expandPath, selectFunction, setRightDock]
  );

  // The diagram surface itself — header-less. The journey identity lives
  // in the intro above; the frame's own header strip (see pageBody) hosts
  // the diagram-level controls. The step-functions dialog and the right
  // docks overlay it (code on demand).
  const inlineBpmn = () => (
    <div className="flex h-full flex-col" style={{ background: "var(--bpmn-bg)" }}>
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
          // Double-click a step → open its code in the docked CODE panel.
          onElementDoubleClick={openCodeForElement}
        />
        {/* Ask AI — docked to the diagram like the desktop; answers come
            through the viewer's /ask relay (token stays server-side). */}
        <AskPanel
          stepFqn={bpmnElement?.code_fqns?.[0]}
          stepSource={
            bpmnElement?.code_fqns?.[0]
              ? getMethodInfo(bpmnElement.code_fqns[0])?.body
              : undefined
          }
          journey={askJourney}
          sessionId={askSessionId}
          repoId={askRepoId}
        />
        {/* CODE — the Ask AI sibling. Docked to the same right edge, but
            selection-gated: appears only while a code-bearing step is
            selected, shows that step's source. Shares the dock state so
            only one of the two is open at a time. */}
        <CodePanel
          element={bpmnElement}
          chapter={chapter}
          onOpenCallGraph={onOpenCallGraphAt}
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
              style={{ width: `min(${codeWidth}px, 92%)`, maxHeight: "84%" }}
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
  // BPMN. The intro still orients; this names the absence honestly.
  const noDiagram = (
    <div
      className="flex items-center gap-2.5 rounded-xl px-5 py-4"
      style={{
        color: "var(--bpmn-text-dim)",
        border: "1px dashed var(--bpmn-border-soft)",
      }}
    >
      <Workflow className="h-3.5 w-3.5" />
      <span className="font-mono text-[11px]">
        No business-flow diagram for this journey — open the call graph (top
        right) to explore its code.
      </span>
    </div>
  );

  // Badges the intro's eyebrow row hosts — journey-level status.
  const introBadges = prBadge && (
    <span
      className="flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px]"
      style={prBadge.style}
      title="PR status — per-step details shown inline in the flow"
    >
      <GitPullRequest className="h-3 w-3" />
      {prBadge.label}
      {changedStepCount > 0 && (
        <span className="opacity-70">· {changedStepCount}</span>
      )}
    </span>
  );

  // READING ORDER (founder ask): the journey's description and its
  // connections come FIRST; below them the diagram sits inside a hard
  // boundary — a framed, browsable window with its own header strip. The
  // page scrolls normally around the frame; the diagram pans/zooms inside
  // it (plain wheel scrolls the page, ⌘+scroll zooms). A thunk (not a
  // const element) because it closes over flowPopup, declared later.
  const pageBody = () => (
    <div
      className="relative h-full overflow-hidden"
      style={{ background: "var(--bpmn-bg)" }}
    >
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1180px] px-6 pb-8">
          <JourneyIntro chapter={chapter} badges={introBadges} />

          {chapter.bpmn ? (
            <section
              className="overflow-hidden rounded-xl"
              style={{
                border: "1px solid var(--bpmn-border-em)",
                background: "var(--bpmn-bg)",
                boxShadow:
                  "0 1px 3px rgb(0 0 0 / 0.18), 0 18px 44px rgb(0 0 0 / 0.22)",
              }}
            >
              {/* The frame's header strip — diagram-level identity and
                  controls only (the journey identity lives in the intro). */}
              <div
                className="flex items-center gap-2.5 px-4 py-2.5"
                style={{
                  borderBottom: "1px solid var(--bpmn-border-soft)",
                  background: "var(--bpmn-bg-deep)",
                }}
              >
                <Workflow
                  className="h-3 w-3"
                  style={{ color: "var(--bpmn-mint)" }}
                />
                <span
                  className="font-mono text-[9.5px] uppercase"
                  style={{ color: "var(--bpmn-mint)", letterSpacing: 3 }}
                >
                  business flow
                </span>
                <span style={{ color: "var(--bpmn-border-em)" }}>·</span>
                <span
                  className="font-mono text-[9.5px] tabular-nums"
                  style={{ color: "var(--bpmn-text-dim)" }}
                >
                  {chapter.bpmn.elements?.length ?? 0} steps ·{" "}
                  {chapter.bpmn.flows?.length ?? 0} paths
                </span>
                <span className="flex-1" />
                {chapter.bpmnValidation && (
                  <span
                    className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[10px] ${
                      chapter.bpmnValidation.verdict === "errors"
                        ? "border-red-500/30 bg-red-500/10 text-red-400"
                        : chapter.bpmnValidation.verdict === "warnings"
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
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
                  onClick={onExportBpmn}
                  disabled={exporting}
                  title="Download as PNG (engineering-paper export)"
                  className="shrink-0 rounded-md p-1.5 transition-colors disabled:cursor-wait disabled:opacity-50"
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
              {/* The window into the diagram — generous fixed height; the
                  canvas pans and zooms INSIDE it, the page scrolls outside. */}
              <div
                className="relative w-full"
                style={{ height: "70vh", minHeight: 480 }}
              >
                {inlineBpmn()}
              </div>
            </section>
          ) : (
            noDiagram
          )}
        </div>
      </div>

      {flowPopup()}
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
  const flowChart = () => (
    <CallFlowChart
      chapter={chapter}
      compact={false}
      expanded={expanded}
      onToggleExpand={toggleExpand}
      onExpandAll={expandAll}
      onCollapseAll={collapseAll}
      scrollRequestRef={scrollRequestRef}
    />
  );
  const flowDockLayout = () => (
    <div key={dockPosition} className="h-full">
      {dockPosition === "bottom" && (
        <ResizablePanelGroup orientation="vertical">
          <ResizablePanel id="canvas" minSize={30}>
            {flowChart()}
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
            {flowChart()}
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
            {flowChart()}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );

  // The call-graph POPUP, layered over whatever the base surface is
  // (the inline summary, or the fullscreen diagram). Self-contained so
  // both bases can mount it.
  const flowPopup = () =>
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
          <div className="min-h-0 flex-1">{flowDockLayout()}</div>
        </div>
      </div>
    );

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
        {/* The description tooltip is gone — the full description now leads
            the page (JourneyIntro), so the ⓘ was redundant. */}
        <span className="ml-auto" />
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
        {/* Fullscreen/expand is retired (founder: "get rid of that") — the
            diagram lives in a framed, browsable container on the page. */}
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
      <div className="min-h-0 flex-1">{pageBody()}</div>
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

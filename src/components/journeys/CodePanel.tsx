import { Code2, PanelRightClose } from "lucide-react";
import type { BpmnElement } from "@/components/bpmn/types";
import type { Chapter } from "@/types/journey";
import { BpmnStepFunctions } from "./BpmnStepFunctions";
import { LeftResizeHandle, WidthNudgeButtons } from "./code-resize";
import { useCodeView } from "./code-view-store";
import { askAvailable } from "./AskPanel";

/** A BPMN step "has code" when it cites at least one function (rich
 *  evidence or legacy bare FQNs). Start / end events cite none. */
function elementHasCode(el: BpmnElement | null): el is BpmnElement {
  if (!el) return false;
  return (el.code_evidence?.length ?? 0) > 0 || (el.code_fqns?.length ?? 0) > 0;
}

/**
 * Right-docked, collapsible CODE panel — the sibling of AskPanel. Mirrors
 * its collapsed-edge-tab pattern, but is SELECTION-GATED: it only exists
 * while a BPMN step that cites code is selected, and shows THAT step's
 * function source. Selecting a different step updates it; deselecting
 * removes it entirely (tab + panel).
 *
 * Coordination with AskPanel: both dock to the right edge and share the
 * `rightDock` field in the code-view store, so opening one collapses the
 * other. The collapsed tab stacks beneath Ask AI's tab.
 *
 * The body reuses BpmnStepFunctions (head-less, all strips open, chrome
 * stripped) so code resolution — head body, base body, PR diff, language —
 * stays in exactly one place.
 */
export function CodePanel({
  element,
  chapter,
  onOpenCallGraph,
}: {
  element: BpmnElement | null;
  chapter: Chapter;
  onOpenCallGraph?: (fqn: string) => void;
}) {
  const rightDock = useCodeView((s) => s.rightDock);
  const setRightDock = useCodeView((s) => s.setRightDock);
  const width = useCodeView((s) => s.width);

  // Selection-gated: no code-bearing step selected → offer nothing.
  if (!elementHasCode(element)) return null;

  const open = rightDock === "code";

  // Collapsed → a thin right-edge tab. Stacks below Ask AI's tab (top-24)
  // when Ask is available; otherwise takes the top slot itself.
  if (!open) {
    const top = askAvailable() ? 190 : 96;
    return (
      <button
        type="button"
        onClick={() => setRightDock("code")}
        title="Show the code behind this step"
        className="absolute right-0 z-40 flex flex-col items-center gap-1 rounded-l-md border border-r-0 px-1.5 py-2.5 shadow"
        style={{
          top,
          background: "var(--bpmn-surface)",
          borderColor: "var(--bpmn-mint)",
          color: "var(--bpmn-mint)",
        }}
      >
        <Code2 className="h-4 w-4" />
        <span
          className="font-mono text-[9px] uppercase tracking-wider"
          style={{ writingMode: "vertical-rl" }}
        >
          Code
        </span>
      </button>
    );
  }

  const shortLabel =
    element.label.length > 40 ? element.label.slice(0, 40) + "…" : element.label;

  return (
    <div
      className="absolute inset-y-0 right-0 z-40 flex flex-col border-l shadow-2xl"
      style={{
        width,
        background: "var(--bpmn-surface)",
        borderColor: "var(--bpmn-border)",
        fontFamily: "var(--bpmn-font-mono)",
      }}
    >
      <LeftResizeHandle factor={1} />
      {/* Header — CODE label + selected step + width controls + minimize */}
      <div
        className="flex shrink-0 items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: "var(--bpmn-border)" }}
      >
        <Code2 className="h-4 w-4" style={{ color: "var(--bpmn-mint)" }} />
        <div className="min-w-0 flex-1">
          <div
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--bpmn-mint)" }}
          >
            Code
          </div>
          <div className="truncate text-[9px]" style={{ color: "var(--bpmn-text-dim)" }}>
            {shortLabel}
          </div>
        </div>
        <WidthNudgeButtons />
        <button
          onClick={() => setRightDock(null)}
          title="Minimize"
          aria-label="Minimize code panel"
          className="rounded p-1 opacity-70 transition-opacity hover:opacity-100"
          style={{ color: "var(--bpmn-text-muted)" }}
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      {/* Body — the step's functions, code shown, source resolution reused.
          `flex` so the list (flex-1) fills and its inner body scrolls. */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <BpmnStepFunctions
          element={element}
          chapter={chapter}
          onOpenCallGraph={onOpenCallGraph}
          hideHeader
          defaultOpen
          bare
        />
      </div>
    </div>
  );
}

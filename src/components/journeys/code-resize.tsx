import { useCallback } from "react";
import { Minus, Plus } from "lucide-react";
import { CODE_WIDTH_STEP, useCodeView } from "./code-view-store";

/**
 * Shared width affordances for the code surfaces (right-docked CODE panel
 * and the centered step-functions dialog). Both write the same shared
 * `width` in the code-view store, so the two surfaces stay in sync and the
 * choice persists across steps.
 */

/** A quick narrower/wider button pair for a panel header. Each click reads
 *  the live width from the store (not a subscribed snapshot) so a rapid
 *  burst of clicks advances one step each, without stale-closure batching. */
export function WidthNudgeButtons() {
  const setWidth = useCodeView((s) => s.setWidth);
  return (
    <div
      className="flex items-center overflow-hidden rounded-md border"
      style={{ borderColor: "var(--bpmn-border-soft)" }}
    >
      <button
        type="button"
        onClick={() => setWidth(useCodeView.getState().width - CODE_WIDTH_STEP)}
        title="Narrower"
        aria-label="Make the code panel narrower"
        className="p-1 opacity-70 transition-opacity hover:opacity-100"
        style={{ color: "var(--bpmn-text-muted)" }}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setWidth(useCodeView.getState().width + CODE_WIDTH_STEP)}
        title="Wider"
        aria-label="Make the code panel wider"
        className="p-1 opacity-70 transition-opacity hover:opacity-100"
        style={{
          color: "var(--bpmn-text-muted)",
          borderLeft: "1px solid var(--bpmn-border-soft)",
        }}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * A drag handle pinned to the LEFT edge of a code surface. Dragging left
 * widens, dragging right narrows. `factor` scales the delta: 1 for an
 * edge-anchored panel (the right dock), 2 for a horizontally-centred box
 * (the dialog, which grows from both sides) so the grabbed edge tracks the
 * pointer 1:1. Pointer-driven, no animation — reduced-motion safe.
 */
export function LeftResizeHandle({ factor = 1 }: { factor?: number }) {
  const setWidth = useCodeView((s) => s.setWidth);
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Never let the grab start a canvas pan or a node drag underneath.
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = useCodeView.getState().width;
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        setWidth(startWidth - dx * factor);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [factor, setWidth],
  );
  return (
    <div
      className="code-resize-handle absolute inset-y-0 left-0 z-20"
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Drag to resize the code panel"
      title="Drag to resize"
    />
  );
}

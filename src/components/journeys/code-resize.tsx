import { useCallback } from "react";
import { useCodeView } from "./code-view-store";

/**
 * Drag-to-resize handle for the code surfaces (right-docked CODE panel and
 * the centered step-functions dialog). Both write the same shared `width`
 * in the code-view store, so the two surfaces stay in sync and the choice
 * persists across steps. (The old +/- nudge buttons were removed — drag is
 * the single, direct way to size a panel; collapse handles the rest.)
 */

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

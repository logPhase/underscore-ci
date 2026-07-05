import {
  PANEL_WIDTH_MAX,
  PANEL_WIDTH_MIN,
  useUIStore,
} from "@/store/use-ui-store";
import { PanelLeftClose, PanelRightClose } from "lucide-react";
import { useRef } from "react";

// Resize controls shared by the two right-anchored code panels (FileCodePanel
// + MethodDetailPanel). The panels sit against the right edge, so widening
// means the LEFT edge travels left — dragging the handle left grows the panel.
// Width lives in use-ui-store (clamped 360–900, persisted).

const STEP = 90; // px per button press

/** Thin draggable strip on the panel's left edge. Pointer-capture drag so it
 *  keeps tracking even when the cursor outruns the 8px hit area. */
export function PanelResizeHandle() {
  const width = useUIStore((s) => s.codePanelWidth);
  const setWidth = useUIStore((s) => s.setCodePanelWidth);
  const start = useRef<{ x: number; w: number } | null>(null);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      title="Drag to resize"
      onPointerDown={(e) => {
        e.preventDefault();
        start.current = { x: e.clientX, w: width };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        // Cursor moves left (smaller clientX) ⇒ wider panel.
        setWidth(start.current.w + (start.current.x - e.clientX));
      }}
      onPointerUp={(e) => {
        start.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      className="group absolute top-0 bottom-0 -left-1 z-10 flex w-2.5 cursor-ew-resize items-center justify-center"
    >
      {/* Visible grip line — dim at rest, brightens on hover/drag. */}
      <span
        className="h-14 w-0.5 rounded-full bg-[hsl(210,15%,35%)] transition-colors group-hover:bg-primary"
        aria-hidden
      />
    </div>
  );
}

/** Narrower / wider stepper buttons for a panel header. */
export function PanelWidthButtons() {
  const width = useUIStore((s) => s.codePanelWidth);
  const setWidth = useUIStore((s) => s.setCodePanelWidth);

  const btn =
    "rounded p-1 text-[hsl(210,15%,55%)] transition-colors hover:bg-white/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        onClick={() => setWidth(width - STEP)}
        disabled={width <= PANEL_WIDTH_MIN}
        title="Narrower"
        aria-label="Make panel narrower"
        className={btn}
      >
        <PanelRightClose className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setWidth(width + STEP)}
        disabled={width >= PANEL_WIDTH_MAX}
        title="Wider"
        aria-label="Make panel wider"
        className={btn}
      >
        <PanelLeftClose className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

import { MemoizedBiologicalWorld as BiologicalWorld } from "@/components/canvas/biological-world";
import CodebaseStats from "@/components/canvas/codebase-stats";
import PRSummaryBanner from "@/components/canvas/PRSummaryBanner";
import { ReactFlowProvider } from "@xyflow/react";
import "./canvas-world.css";
import { GroupModulesControl } from "@/components/canvas/group-modules-control";
import { HelpMessage } from "@/components/canvas/help-message";
import { MethodDetailPanel } from "@/components/canvas/MethodDetailPanel";
import { FileCodePanel } from "@/components/canvas/FileCodePanel";
import { FileCodeChip } from "@/components/canvas/FileCodeChip";
import { CanvasTooltip } from "@/components/canvas/CanvasTooltip";
import { JourneyLinesPanel } from "@/components/canvas/journey-lines-panel";
import { useAnalysis } from "@/store/use-analysis-store";
import { Navigate } from "react-router-dom";

export function CanvasWorldPage() {
  const transformedData = useAnalysis((s) => s.transformedData);

  // replace — a data-less bounce must never become a history entry a Back
  // press can land on.
  if (!transformedData) return <Navigate to="/" replace />;

  return (
    /*
      ReactFlowProvider must wrap everything that uses RF hooks.
      It goes OUTSIDE BiologicalWorld so ViewportBridge can call useReactFlow().
    */
    <ReactFlowProvider>
      {/* canvas-stage: scopes the --cw-* dual-palette tokens (index.css).
          The map follows the theme — dark by default, warm paper when
          html.reading-paper is set. Chrome (banner, stats, panels) rides
          the shadcn tokens / zinc remap like the rest of the app. */}
      {/* h-full/w-full — sized by the SessionShell content area, not the
          viewport (the session rail owns the left 232px). */}
      <div className="canvas-stage relative flex h-full w-full flex-col items-center justify-center">
        <PRSummaryBanner />
        <CodebaseStats />
        <BiologicalWorld />
        <HelpMessage />
        <GroupModulesControl />
        <MethodDetailPanel />
        <FileCodePanel />
        <FileCodeChip />
        <CanvasTooltip />
        <JourneyLinesPanel />
      </div>
    </ReactFlowProvider>
  );
}

/**
 * KNOWN ISSUES TO FIX AFTER THE DEMO
 * ────────────────────────────────────
 *
 * 1. methodPosRef / filePosRef write-during-render
 *    CanvasWorld registers method positions into refs during render.
 *    callChainEdges memo reads those refs. In the new architecture these
 *    refs must be populated before callChainEdges runs. For the demo this
 *    still works because everything is in one React tree. Fix post-demo
 *    by converting to explicit registerPosition() callbacks called in
 *    useEffect (after paint).
 *
 * 2. zoom compensation (6/zoom, strokeWidth/zoom etc.)
 *    CanvasWorld currently reads zoom from CanvasContext (which now reads
 *    from useViewportStore). The ViewportBridge keeps the store in sync
 *    with RF, so this works. No action needed for demo.
 *    Post-demo: replace useCanvas().zoom with useViewportStore(s => s.zoom)
 *    directly inside CanvasWorld for cleaner dependency graph.
 *
 * 3. Minimap shows dots, not blobs
 *    Invisible anchor nodes appear as small dots in the RF minimap.
 *    The blobs are in the SVG layer which the minimap doesn't see.
 *    For the demo this is acceptable. Post-demo: implement a custom
 *    minimapNodeComponent that draws a circle scaled to service.radius.
 *
 * 4. containerRef dimensions in zoomTo
 *    ViewportBridge's patched zoomTo uses .react-flow__renderer to get
 *    container dimensions. This works in normal layouts. If your Electron
 *    window has panels that offset the RF container, measure containerRef
 *    from BiologicalWorld instead (pass it down or use a store).
 */

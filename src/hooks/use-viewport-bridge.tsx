/**
 * use-viewport-bridge.tsx
 *
 * Connects React Flow's viewport to useViewportStore.
 * Mount this once inside a <ReactFlow> tree via <ViewportBridge />.
 *
 * What it does:
 *  - RF → store: onViewportChange keeps pan/zoom/semanticZoomLevel in sync
 *  - store → RF: patches zoomTo so it calls rfInstance.setViewport instead of
 *    writing pan/zoom directly (which would fight RF's internal transform)
 */

import { useEffect, useRef } from "react";
import {
  useReactFlow,
  useOnViewportChange,
  type Viewport,
} from "@xyflow/react";
import { useViewportStore } from "@/store/use-viewport-store";
import { toSemanticLevel } from "@/lib/canvas/utils";
export function ViewportBridge() {
  const rf = useReactFlow();
  const patched = useRef(false);

  useEffect(() => {
    // Sync initial RF viewport → store immediately on mount
    const { x, y, zoom } = rf.getViewport();
    useViewportStore.setState({
      pan: { x, y },
      zoom,
      semanticZoomLevel: toSemanticLevel(zoom),
    });
  }, [rf]);
  // ── 1. Patch zoomTo once so it drives RF instead of writing store directly ──
  useEffect(() => {
    if (patched.current) return;
    patched.current = true;

    useViewportStore.setState({
      zoomTo: (cx, cy, targetZoom, _viewportW, _viewportH) => {
        const clamped = Math.max(0.1, Math.min(12, targetZoom));
        const domRect = document
          .querySelector(".react-flow__renderer")
          ?.getBoundingClientRect();
        const w = domRect?.width ?? window.innerWidth;
        const h = domRect?.height ?? window.innerHeight;
        rf.setViewport(
          {
            x: w / 2 - cx * clamped,
            y: h / 2 - cy * clamped,
            zoom: clamped,
          },
          { duration: 600 }
        );
        useViewportStore.setState({ animating: true });
        setTimeout(() => useViewportStore.setState({ animating: false }), 950);
      },
    });
  }, [rf]);

  // ── 2. RF → store: mirror every viewport change into zustand ──
  useOnViewportChange({
    onChange: ({ x, y, zoom }: Viewport) => {
      const level = toSemanticLevel(zoom);
      useViewportStore.setState({
        pan: { x, y },
        zoom,
        semanticZoomLevel: level,
      });
    },
  });

  return null;
}

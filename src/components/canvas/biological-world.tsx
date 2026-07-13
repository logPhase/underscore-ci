import { Shortcuts } from "@/hooks/use-shortcuts";
import { ViewportBridge } from "@/hooks/use-viewport-bridge";
import { nodeTypes, useRFNodes } from "@/hooks/use-rf-graph";
import { useUIStore } from "@/store/use-ui-store";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ViewportPortal,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { memo, useCallback, useEffect, useRef } from "react";
import { CanvasWorld } from "./CanvasWorld";
import { SearchOverlay } from "./SearchOverlay";

function BiologicalWorld() {
  const setLoadPhase = useUIStore((state) => state.setLoadPhase);

  const containerRef = useRef<HTMLDivElement>(null);
  const didDragRef = useRef(false);

  const nodes = useRFNodes();

  // ── Track drag so click handlers can ignore drag-ends ────────────────────
  const onMoveStart = useCallback(() => {
    didDragRef.current = false;
  }, []);
  const onMove = useCallback(() => {
    didDragRef.current = true;
  }, []);
  const onMoveEnd = useCallback(() => {
    // Reset after a tick so click fires after moveEnd.
    setTimeout(() => {
      didDragRef.current = false;
    }, 0);
  }, []);

  const defaultViewport = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    zoom: 0.55,
  };
  // Progressive loading
  useEffect(() => {
    const timers = [
      setTimeout(() => setLoadPhase(1), 100),
      setTimeout(() => setLoadPhase(2), 400),
      setTimeout(() => setLoadPhase(3), 700),
      setTimeout(() => setLoadPhase(4), 1000),
      setTimeout(() => setLoadPhase(5), 1400),
    ];
    return () => timers.forEach(clearTimeout);
  }, [setLoadPhase]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        nodeTypes={nodeTypes}
        defaultViewport={defaultViewport}
        // 0.005, not 0.05: fitView clamps at minZoom, so a big monorepo map
        // (jellyfin: 182 services across 7 group hulls) could never fit the
        // viewport — the initial camera stranded mid-map with Zoom Out disabled.
        minZoom={0.005}
        maxZoom={12}
        nodesDraggable={false}
        selectionOnDrag={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onMoveStart={onMoveStart}
        onMove={onMove}
        fitView
        fitViewOptions={{
          maxZoom: 0.55,
        }}
        onMoveEnd={onMoveEnd}
        // Required for ViewportPortal to work correctly.
        className="bg-transparent"
      >
        <Shortcuts containerRef={containerRef} />
        <SearchOverlay containerRef={containerRef} />
        {/* ── Wires RF viewport ↔ useViewportStore ── */}
        <ViewportBridge />
        <ViewportPortal>
          {/*
            SVG viewBox matches your world coordinate range.
            overflow="visible" ensures blobs near the edges don't clip.
            The RF transform matrix handles pan/zoom — don't apply your own.
          */}
          <svg
            style={{
              position: "absolute",
              overflow: "visible",
              pointerEvents: "all",
              // Position at RF's (0,0) world origin.
              top: 0,
              left: 0,
            }}
            overflow="visible"
          >
            <CanvasWorld containerRef={containerRef} didDragRef={didDragRef} />
          </svg>
        </ViewportPortal>
        <MiniMap
          nodeColor="var(--cw-minimap-node)"
          maskColor="var(--cw-minimap-mask)"
          style={{ background: "var(--cw-minimap-bg)", borderRadius: "0px" }}
          pannable
          zoomable
        />
        <Controls
          showInteractive={false}
          fitViewOptions={{
            maxZoom: 0.55,
            duration: 300,
          }}
        />
        <Background />
      </ReactFlow>
    </div>
  );
}

export const MemoizedBiologicalWorld = memo(BiologicalWorld);

/**
 * use-rf-graph.ts
 *
 * Builds the React Flow nodes from services/dependencies.
 *
 * Nodes:   invisible 1×1 anchors at each service's world (cx, cy).
 *          RF uses these for: minimap, fitView, edge routing.
 *          They are NOT the visual blobs — those live in <ServiceRegion />.
 *
 *
 * Both are stable references (useMemo with no dynamic deps) so RF never
 * thrashes its internal layout engine.
 */

import { usePRAffectedData } from "@/hooks/canvas/use-pr-affected-data";
import { useAnalysis } from "@/store/use-analysis-store";
import { useUIStore } from "@/store/use-ui-store";
import type { Node, NodeTypes } from "@xyflow/react";
import { memo, useMemo } from "react";

// ── Node type registered in <ReactFlow nodeTypes={...}> ─────────────────
// This component renders nothing — just a transparent hit target.
const SERVICE_ANCHOR_TYPE = "service-anchor";
const ServiceAnchorNode = memo(() => {
  return null;
});

export const nodeTypes: NodeTypes = {
  [SERVICE_ANCHOR_TYPE]: ServiceAnchorNode,
};

// ── Build nodes ───────────────────────────────────────────────────────────────
export function useRFNodes(): Node[] {
  const transformedData = useAnalysis((s) => s.transformedData);
  const prMode = useUIStore((state) => state.prMode);

  const { prAffectedServices } = usePRAffectedData();

  return useMemo(() => {
    if (!transformedData) return [];
    const services = transformedData.services || [];
    const sharedLibs = transformedData.sharedLibs || [];

    const nodes: Node[] = [];

    for (const svc of services) {
      // if in prMode, only add nodes that are PR-affected
      if (prMode && !prAffectedServices.has(svc.id)) continue;

      const size = svc.radius * 2;
      nodes.push({
        id: svc.id,
        type: SERVICE_ANCHOR_TYPE,
        // Position top-left corner so the node center aligns with (cx, cy)
        position: { x: svc.cx - svc.radius, y: svc.cy - svc.radius },
        data: { service: svc },
        width: size,
        height: size,
        // pointerEvents: 'none' ensures the node wrapper doesn't block clicks on the SVG overlay.
        // No opacity: 0 style so it renders on the MiniMap.
        style: {
          opacity: 0,
          pointerEvents: "none",
        },
        draggable: false,
        selectable: false,
        focusable: false,
      });
    }

    for (const lib of sharedLibs) {
      if (prMode && !prAffectedServices.has(lib.id)) continue;

      const size = lib.radius * 2;
      nodes.push({
        id: lib.id,
        type: SERVICE_ANCHOR_TYPE,
        position: { x: lib.cx - lib.radius, y: lib.cy - lib.radius },
        data: { service: lib },
        width: size,
        height: size,
        style: {
          opacity: 0,
          pointerEvents: "none",
        },
        draggable: false,
        selectable: false,
        focusable: false,
      });
    }

    return nodes;
  }, [transformedData, prMode, prAffectedServices]);
}

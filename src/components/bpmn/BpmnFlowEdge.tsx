import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { roundedPath } from "./layout";
import { CHIP_MAXW } from "./flow-graph";

interface BpmnEdgeData {
  condition?: string;
  chip?: { x: number; y: number } | null;
  points?: { x: number; y: number }[];
}

/** A sequence flow with an optional condition pill. The pill sits at a
 *  globally collision-solved position (data.chip) so it never lands on a
 *  shape or another pill; the wire follows the layout's orthogonal route
 *  (data.points) so pill and wire share one geometry. A negative/no/deny
 *  condition renders in rose; everything else in mint — the same
 *  pre-attentive branch cue the SVG renderer used. */
export function BpmnFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  const d = data as BpmnEdgeData | undefined;
  const [ssPath, ssLabelX, ssLabelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });
  const path =
    d?.points && d.points.length >= 2 ? roundedPath(d.points) : ssPath;

  const condition = d?.condition;
  const negative = condition && /^(no|false|deny|reject)$/i.test(condition);
  const color = negative ? "var(--bpmn-rose)" : "var(--bpmn-mint)";
  const cx = d?.chip?.x ?? ssLabelX;
  const cy = d?.chip?.y ?? ssLabelY;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{ stroke: "var(--bpmn-border-em)", strokeWidth: 1.7 }}
      />
      {condition && (
        <EdgeLabelRenderer>
          <div
            title={condition}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${cx}px, ${cy}px)`,
              maxWidth: CHIP_MAXW,
              padding: "3px 8px",
              borderRadius: 8,
              fontSize: 11,
              lineHeight: 1.28,
              fontFamily: "var(--bpmn-font-mono)",
              fontWeight: 600,
              letterSpacing: 0.2,
              color,
              background: `color-mix(in srgb, ${color} 14%, var(--bpmn-canvas))`,
              border: `1px solid color-mix(in srgb, ${color} 48%, transparent)`,
              boxShadow: "0 1px 6px hsla(220, 30%, 3%, 0.5)",
              pointerEvents: "none",
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
              overflow: "hidden",
              textAlign: "center",
            }}
          >
            {condition}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

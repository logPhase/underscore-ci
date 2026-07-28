import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";

/** A sequence flow with an optional condition pill at its midpoint. A
 *  negative/no/deny condition renders in rose; everything else in mint —
 *  the same pre-attentive branch cue the SVG renderer used. */
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
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });
  const condition = (data as { condition?: string } | undefined)?.condition;
  const negative = condition && /^(no|false|deny|reject)$/i.test(condition);
  const color = negative ? "var(--bpmn-rose)" : "var(--bpmn-mint)";
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{ stroke: "var(--bpmn-border-em)", strokeWidth: 1.6 }}
      />
      {condition && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              padding: "1px 7px",
              borderRadius: 999,
              fontSize: 10,
              fontFamily: "var(--bpmn-font-mono)",
              fontWeight: 600,
              letterSpacing: 0.3,
              color,
              background: `color-mix(in srgb, ${color} 12%, var(--bpmn-canvas))`,
              border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            {condition}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

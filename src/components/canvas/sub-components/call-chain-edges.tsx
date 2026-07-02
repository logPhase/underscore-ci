import { useSelectionStore } from "@/store/use-selection-store";
import { CallChainEdge } from "@/types/canvas";
import { memo, RefObject } from "react";

interface CallChainEdgesProps {
  callChainEdges: CallChainEdge[];
  methodPosRef: RefObject<
    Map<
      string,
      {
        x: number;
        y: number;
        r: number;
        fileId: string;
        serviceId: string;
      }
    >
  >;
}

const CallChainEdges = ({
  callChainEdges,
  methodPosRef,
}: CallChainEdgesProps) => {
  const selectedFunctionCtx = useSelectionStore((s) => s.selectedFunctionCtx);

  const selPos = methodPosRef.current.get(selectedFunctionCtx.functionId);
  return (
    <g style={{ pointerEvents: "none" }}>
      {/* Bright glow around selected method */}
      {selPos && (
        <circle
          cx={selPos.x}
          cy={selPos.y}
          r={selPos.r + 3}
          fill="none"
          stroke="var(--cw-gold-bright)"
          strokeWidth={2}
          opacity={0.6}
          filter="url(#call-glow)"
        />
      )}
      {/* Call chain bezier lines */}
      {callChainEdges.map((edge, i) => {
        const dx = edge.toX - edge.fromX;
        const dy = edge.toY - edge.fromY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.1) return null;
        const offset = Math.min(dist * 0.3, 15);
        const nx = (-dy / dist) * offset;
        const ny = (dx / dist) * offset;
        const cx = (edge.fromX + edge.toX) / 2 + nx;
        const cy = (edge.fromY + edge.toY) / 2 + ny;

        const isCaller = edge.type === "caller";
        const color = isCaller ? "var(--cw-caller)" : "var(--cw-callee)";
        const width =
          edge.scope === "cross-service"
            ? 2.5
            : edge.scope === "cross-file"
              ? 1.5
              : 1;
        const opacity =
          edge.scope === "same-file"
            ? 0.7
            : edge.scope === "cross-file"
              ? 0.5
              : 0.6;
        const dashed = edge.scope === "cross-service";

        return (
          <g key={`cc-${i}`}>
            {/* Glow layer */}
            <path
              d={`M ${edge.fromX} ${edge.fromY} Q ${cx} ${cy} ${edge.toX} ${edge.toY}`}
              fill="none"
              stroke={color}
              strokeWidth={width * 3}
              opacity={opacity * 0.15}
              filter="url(#call-glow)"
            />
            {/* Main line with marching ants */}
            <path
              d={`M ${edge.fromX} ${edge.fromY} Q ${cx} ${cy} ${edge.toX} ${edge.toY}`}
              fill="none"
              stroke={color}
              strokeWidth={width}
              opacity={opacity}
              strokeDasharray={dashed ? "6 3" : "4 2"}
            >
              <animate
                attributeName="stroke-dashoffset"
                from="18"
                to="0"
                dur="1s"
                repeatCount="indefinite"
              />
            </path>
            {/* Endpoint dot for cross-file targets */}
            {edge.scope !== "same-file" && (
              <circle
                cx={edge.toX}
                cy={edge.toY}
                r={3}
                fill={color}
                opacity={opacity}
              />
            )}
            {/* Label for cross-file targets */}
            {edge.scope !== "same-file" && (
              <text
                x={edge.toX + 5}
                y={edge.toY - 3}
                fontSize={3.5}
                fill={color}
                opacity={0.8}
                fontFamily="'JetBrains Mono', monospace"
                className="pointer-events-none"
              >
                {edge.targetName}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
};

export const MemoizedCallChainEdges = memo(CallChainEdges);

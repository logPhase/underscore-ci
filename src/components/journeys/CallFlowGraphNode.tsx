import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { StepKind, StepPRStatus } from "@/types/journey";
import { STATUS_STYLES } from "@/lib/status-colors";
import type { TreeNode } from "@/lib/callgraph/tree-layout";
import { NODE_H, NODE_W } from "@/lib/callgraph/tree-layout";

export type CallNodeData = {
  node: TreeNode;
  hue: number;
  isActive: boolean;
  onPath: boolean;
  isExpanded: boolean;
  onToggle: (fqn: string) => void;
};

const PR_COLORS: Record<
  StepPRStatus,
  { bg: string; border: string; text: string }
> = {
  added: STATUS_STYLES.added,
  modified: STATUS_STYLES.modified,
  deleted: STATUS_STYLES.deleted,
  disconnected: STATUS_STYLES.disconnected,
};

const INTERFACE_STYLES: Record<StepKind, { border: string; text: string }> = {
  interface: { border: "hsl(265, 50%, 55%)", text: "hsl(265, 55%, 75%)" },
  abstract: { border: "hsl(265, 50%, 55%)", text: "hsl(265, 55%, 75%)" },
};

const HANDLE: React.CSSProperties = {
  opacity: 0,
  width: 1,
  height: 1,
  border: "none",
  background: "transparent",
};

function CallFlowGraphNodeInner({ data }: NodeProps) {
  const { node, hue, isActive, onPath, isExpanded, onToggle } =
    data as unknown as CallNodeData;
  const pr = node.prChange ? PR_COLORS[node.prChange] : null;
  const iface = node.kind ? INTERFACE_STYLES[node.kind] : null;
  const hasChildren = node.childCount > 0;

  const bg = pr
    ? pr.bg
    : iface
      ? "hsla(265, 30%, 10%, 0.94)"
      : node.isTrivial
        ? "hsla(220, 15%, 10%, 0.6)"
        : isActive
          ? `hsla(${hue}, 45%, 13%, 0.95)`
          : "hsla(220, 18%, 9%, 0.92)";
  const border = pr
    ? pr.border
    : iface
      ? iface.border
      : node.isTrivial
        ? "hsla(210, 10%, 20%, 0.4)"
        : isActive || onPath
          ? `hsl(${hue}, 50%, 45%)`
          : "hsla(210, 14%, 20%, 0.5)";
  const nameColor = pr ? pr.text : iface ? iface.text : `hsl(${hue}, 60%, 78%)`;

  return (
    <div
      style={{
        width: NODE_W,
        height: NODE_H,
        boxSizing: "border-box",
        borderRadius: 8,
        background: bg,
        border: `${pr || iface || isActive ? 1.5 : 1}px ${
          node.prChange === "deleted" || node.prChange === "disconnected"
            ? "dashed"
            : "solid"
        } ${border}`,
        boxShadow: isActive
          ? `0 0 0 2px hsla(${hue}, 60%, 50%, 0.35)`
          : undefined,
        opacity: node.isTrivial && !pr && !iface ? 0.6 : 1,
        padding: "6px 8px",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        fontFamily: "var(--bpmn-font-mono, ui-monospace, monospace)",
      }}
      title={node.fqn}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={HANDLE}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={HANDLE}
        isConnectable={false}
      />
      {node.className && (
        <div
          style={{
            fontSize: 8.5,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: `hsla(${hue}, 40%, 62%, 0.85)`,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {node.seq > 0 ? `${node.seq}· ` : ""}
          {node.className}
        </div>
      )}
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: nameColor,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          paddingRight: hasChildren ? 22 : 0,
        }}
      >
        {node.name}
      </div>
      {hasChildren && (
        <button
          className="nodrag"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.fqn);
          }}
          title={isExpanded ? "Collapse" : `Expand ${node.childCount}`}
          style={{
            position: "absolute",
            right: 5,
            top: "50%",
            transform: "translateY(-50%)",
            minWidth: 18,
            height: 18,
            padding: "0 4px",
            borderRadius: 5,
            fontSize: 10,
            fontWeight: 700,
            lineHeight: "18px",
            color: `hsl(${hue}, 55%, 72%)`,
            background: `hsla(${hue}, 40%, 18%, 0.9)`,
            border: `1px solid hsla(${hue}, 40%, 40%, 0.6)`,
            cursor: "pointer",
          }}
        >
          {isExpanded ? "−" : `+${node.childCount}`}
        </button>
      )}
    </div>
  );
}

export const CallFlowGraphNode = memo(CallFlowGraphNodeInner);

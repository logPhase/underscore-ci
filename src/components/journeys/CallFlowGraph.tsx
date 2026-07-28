import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  type Edge,
  MarkerType,
  MiniMap,
  type Node,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Chapter } from "@/types/journey";
import { useJourneyUIStore } from "@/store/use-journey-ui-store";
import {
  buildCallGraphLayout,
  getHue,
  NODE_H,
  NODE_W,
} from "@/lib/callgraph/tree-layout";
import { CallFlowGraphNode, type CallNodeData } from "./CallFlowGraphNode";

interface Props {
  chapter: Chapter;
  compact?: boolean;
  expanded: Set<string>;
  onToggleExpand: (fqn: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  scrollRequestRef?: React.MutableRefObject<string | null>;
}

const nodeTypes = { callnode: CallFlowGraphNode };

function CallFlowGraphInner({
  chapter,
  expanded,
  onToggleExpand,
  onExpandAll,
  onCollapseAll,
  scrollRequestRef,
}: Props) {
  const rf = useReactFlow();
  const { activeFunctionId, setActiveFunctionId } = useJourneyUIStore();

  const { nodes, edges } = useMemo(() => {
    const layout = buildCallGraphLayout(chapter, expanded);
    // active path = active node + its ancestors (child→parent from edges)
    const parentOf = new Map<string, string>();
    for (const e of layout.edges) parentOf.set(e.to.fqn, e.from.fqn);
    const onPath = new Set<string>();
    let cur: string | undefined = activeFunctionId ?? undefined;
    while (cur) {
      onPath.add(cur);
      cur = parentOf.get(cur);
    }
    const rfNodes: Node<CallNodeData>[] = layout.nodes.map((n) => ({
      id: n.fqn,
      type: "callnode",
      position: { x: n.x, y: n.y },
      width: NODE_W,
      height: NODE_H,
      data: {
        node: n,
        hue: getHue(n.className),
        isActive: activeFunctionId === n.fqn,
        onPath: onPath.has(n.fqn),
        isExpanded: expanded.has(n.fqn),
        onToggle: onToggleExpand,
      },
      style: { width: NODE_W, height: NODE_H },
    }));
    const rfEdges: Edge[] = layout.edges.map((e, i) => {
      const lit = onPath.has(e.from.fqn) && onPath.has(e.to.fqn);
      return {
        id: `ce${i}`,
        source: e.from.fqn,
        target: e.to.fqn,
        type: "smoothstep",
        style: {
          stroke: lit
            ? `hsl(${getHue(e.from.className)}, 60%, 55%)`
            : "hsla(210, 14%, 32%, 0.55)",
          strokeWidth: lit ? 2 : 1.2,
        },
        markerEnd: { type: MarkerType.ArrowClosed },
      };
    });
    return { nodes: rfNodes, edges: rfEdges };
  }, [chapter, expanded, activeFunctionId, onToggleExpand]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (activeFunctionId !== node.id) setActiveFunctionId(node.id);
      const data = node.data as unknown as CallNodeData;
      if (data.node.childCount > 0 && !expanded.has(node.id))
        onToggleExpand(node.id);
    },
    [activeFunctionId, setActiveFunctionId, expanded, onToggleExpand],
  );

  // Center on an externally requested node (e.g. BPMN element → its method).
  useEffect(() => {
    const fqn = scrollRequestRef?.current;
    if (!fqn) return;
    const n = rf.getNode(fqn);
    if (n) {
      rf.setCenter(n.position.x + NODE_W / 2, n.position.y + NODE_H / 2, {
        zoom: 1,
        duration: 400,
      });
      setActiveFunctionId(fqn);
    }
    scrollRequestRef.current = null;
  }, [scrollRequestRef, rf, setActiveFunctionId, nodes]);

  return (
    <div
      className="bpmn-canvas-root"
      style={{
        width: "100%",
        height: "100%",
        background: "var(--bpmn-canvas)",
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.15}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        elementsSelectable
      >
        <Background gap={24} color="var(--bpmn-border)" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => {
            const d = n.data as unknown as CallNodeData;
            return `hsl(${d?.hue ?? 210}, 40%, 40%)`;
          }}
          maskColor="color-mix(in srgb, var(--bpmn-canvas) 70%, transparent)"
          style={{ background: "var(--bpmn-surface)" }}
        />
        <Panel position="top-right">
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={onExpandAll}
              style={{
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 6,
                color: "var(--bpmn-text-muted)",
                background: "var(--bpmn-surface)",
                border: "1px solid var(--bpmn-border)",
                cursor: "pointer",
              }}
            >
              Expand all
            </button>
            <button
              onClick={onCollapseAll}
              style={{
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 6,
                color: "var(--bpmn-text-muted)",
                background: "var(--bpmn-surface)",
                border: "1px solid var(--bpmn-border)",
                cursor: "pointer",
              }}
            >
              Collapse
            </button>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

/** React Flow call-graph renderer — drop-in for the SVG CallFlowChart.
 *  Same props; selection drives the shared journey UI store's
 *  activeFunctionId (which opens the code panel), expansion via the
 *  parent's expanded set. */
export default function CallFlowGraph(props: Props) {
  return (
    <ReactFlowProvider>
      <CallFlowGraphInner {...props} />
    </ReactFlowProvider>
  );
}

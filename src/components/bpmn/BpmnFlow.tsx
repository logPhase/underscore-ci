import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import {
  Background,
  Controls,
  getNodesBounds,
  getViewportForBounds,
  MiniMap,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import "@xyflow/react/dist/style.css";
import type { BpmnJourney } from "./types";
import type { StepKnowledge } from "@/lib/transform-data/journey-knowledge";
import type { ExportOptions } from "@/lib/exportBpmnPng";
import { buildBpmnFlowGraph } from "./flow-graph";
import { BpmnFlowNode, type BpmnNodeData } from "./BpmnFlowNode";
import { BpmnFlowEdge } from "./BpmnFlowEdge";
import { KnowledgePanel } from "./KnowledgePanel";

export interface BpmnCanvasHandle {
  exportPng: (
    filename: string,
    titleBlock?: ExportOptions["titleBlock"],
  ) => Promise<void>;
}

interface Props {
  journey: BpmnJourney;
  onChange?: (next: BpmnJourney) => void;
  getSource?: (fqn: string) => string | undefined;
  onSelectionChange?: (elementId: string | null) => void;
  elementPrStatus?: Map<string, "added" | "modified" | "deleted">;
  elementKnowledge?: Map<string, StepKnowledge>;
  onElementDoubleClick?: (elementId: string) => void;
}

const nodeTypes = { bpmn: BpmnFlowNode };
const edgeTypes = { bpmn: BpmnFlowEdge };

const PR_MINIMAP = {
  added: "var(--bpmn-mint)",
  modified: "var(--bpmn-amber)",
  deleted: "var(--bpmn-rose)",
} as const;

function BpmnFlowInner(
  {
    journey,
    onSelectionChange,
    elementPrStatus,
    elementKnowledge,
    onElementDoubleClick,
  }: Props,
  ref: React.Ref<BpmnCanvasHandle>,
) {
  const rf = useReactFlow();
  const [knowledgeNodeId, setKnowledgeNodeId] = useState<string | null>(null);

  const { nodes, edges } = useMemo(
    () =>
      buildBpmnFlowGraph(journey, elementPrStatus, elementKnowledge, setKnowledgeNodeId),
    [journey, elementPrStatus, elementKnowledge],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => onSelectionChange?.(node.id),
    [onSelectionChange],
  );
  const onPaneClick = useCallback(() => {
    onSelectionChange?.(null);
    setKnowledgeNodeId(null);
  }, [onSelectionChange]);
  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => onElementDoubleClick?.(node.id),
    [onElementDoubleClick],
  );

  useImperativeHandle(
    ref,
    () => ({
      exportPng: async (filename: string) => {
        const viewportEl = document.querySelector<HTMLElement>(
          ".bpmn-flow-root .react-flow__viewport",
        );
        if (!viewportEl) throw new Error("diagram not ready");
        const W = 2400;
        const H = 1500;
        const bounds = getNodesBounds(rf.getNodes());
        const vp = getViewportForBounds(bounds, W, H, 0.4, 2.5, 0.12);
        const dataUrl = await toPng(viewportEl, {
          backgroundColor:
            getComputedStyle(
              document.querySelector(".bpmn-flow-root") as Element,
            ).getPropertyValue("--bpmn-canvas") || "#0b0f1a",
          width: W,
          height: H,
          style: {
            width: `${W}px`,
            height: `${H}px`,
            transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
          },
        });
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
        a.click();
      },
    }),
    [rf],
  );

  const knowledge = knowledgeNodeId
    ? elementKnowledge?.get(knowledgeNodeId)
    : null;
  const showPanel =
    !!knowledge && (knowledge.docs.length > 0 || knowledge.facts.length > 0);

  return (
    <div
      className="bpmn-canvas-root bpmn-flow-root"
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: "var(--bpmn-canvas)",
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeDoubleClick={onNodeDoubleClick}
        fitView
        // Readable by default: never open a wide flow below ~0.62 zoom (text
        // would be unreadable) — clamp the fit and let the user pan instead of
        // forcing a zoom-in. Small flows still cap at ~1.05 so they don't
        // balloon. Instance minZoom stays low so manual zoom-out to an
        // overview is still possible; the minimap covers the birds-eye.
        fitViewOptions={{ padding: 0.14, minZoom: 0.72, maxZoom: 1.1 }}
        minZoom={0.2}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        elementsSelectable
        defaultEdgeOptions={{ type: "bpmn" }}
      >
        <Background gap={24} color="var(--bpmn-border)" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) =>
            PR_MINIMAP[
              (n.data as BpmnNodeData)?.prChange as keyof typeof PR_MINIMAP
            ] ?? "var(--bpmn-surface-hi)"
          }
          maskColor="color-mix(in srgb, var(--bpmn-canvas) 70%, transparent)"
          style={{ background: "var(--bpmn-surface)" }}
        />
      </ReactFlow>
      {/* Right-anchored knowledge panel (simplified from the anchored SVG
          version — interaction-first). The panel is position:absolute at
          (0,0) of this wrapper, which itself sits at the container's right. */}
      {showPanel && knowledge && (
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 12,
            bottom: 16,
            width: 420,
          }}
        >
          <KnowledgePanel
            key={knowledgeNodeId}
            left={0}
            top={0}
            knowledge={knowledge.knowledge}
            docs={knowledge.docs}
            facts={knowledge.facts}
            onClose={() => setKnowledgeNodeId(null)}
          />
        </div>
      )}
    </div>
  );
}

const BpmnFlowWithRef = forwardRef<BpmnCanvasHandle, Props>(BpmnFlowInner);

/** React Flow BPMN renderer. Wraps in a provider so the imperative
 *  exportPng handle can reach the RF instance. Drop-in for the old
 *  custom-SVG BpmnCanvas (same props + handle). */
export const BpmnFlow = forwardRef<BpmnCanvasHandle, Props>(
  function BpmnFlow(props, ref) {
    return (
      <ReactFlowProvider>
        <BpmnFlowWithRef {...props} ref={ref} />
      </ReactFlowProvider>
    );
  },
);

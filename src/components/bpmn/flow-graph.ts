import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { BpmnJourney } from "./types";
import type { StepKnowledge } from "@/lib/transform-data/journey-knowledge";
import { layoutGraph } from "./layout";
import type { BpmnNodeData } from "./BpmnFlowNode";

/** Pure journey → React Flow graph. Dagre computes centre positions; React
 *  Flow wants top-left, so we shift by half the node size. Node `type` is
 *  always "bpmn" (one custom renderer switches on the element type); the
 *  BPMN element kind rides in `data.el.type`. Kept pure + separate from the
 *  component so the mapping is unit-testable without mounting React Flow. */
export function buildBpmnFlowGraph(
  journey: BpmnJourney,
  elementPrStatus?: Map<string, "added" | "modified" | "deleted">,
  elementKnowledge?: Map<string, StepKnowledge>,
  onKnowledge: (id: string) => void = () => {},
): { nodes: Node<BpmnNodeData>[]; edges: Edge[] } {
  const layout = layoutGraph(journey.elements, journey.flows);
  const nodes: Node<BpmnNodeData>[] = layout.nodes.map((n) => {
    const k = elementKnowledge?.get(n.id);
    return {
      id: n.id,
      type: "bpmn",
      position: { x: n.x - n.w / 2, y: n.y - n.h / 2 },
      width: n.w,
      height: n.h,
      data: {
        el: n,
        prChange: elementPrStatus?.get(n.id) ?? null,
        knowledgeCount: k ? k.docs.length + k.facts.length : 0,
        onKnowledge,
      },
      style: { width: n.w, height: n.h, overflow: "visible" },
    };
  });
  const edges: Edge[] = journey.flows.map((f, i) => ({
    id: `e${i}`,
    source: f.from,
    target: f.to,
    type: "bpmn",
    data: { condition: f.condition },
    markerEnd: { type: MarkerType.ArrowClosed, color: "var(--bpmn-border-em)" },
  }));
  return { nodes, edges };
}

import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { BpmnJourney } from "./types";
import type { StepKnowledge } from "@/lib/transform-data/journey-knowledge";
import { layoutGraph, resolveChipPlacements } from "./layout";
import type { BpmnNodeData } from "./BpmnFlowNode";

// Chip sizing shared with the renderer (BpmnFlowEdge): a mono 11px pill,
// capped to CHIP_MAXW and wrapped to at most 2 lines. The solver measures the
// exact box it will paint so its collision rects match the pixels.
export const CHIP_MAXW = 190;
const CHAR_W = 6.5;
const PAD_X = 16;
const LINE_H = 15;
const PAD_Y = 9;

export function measureChip(text: string): { w: number; h: number } {
  const oneLine = text.length * CHAR_W + PAD_X;
  if (oneLine <= CHIP_MAXW) return { w: Math.ceil(oneLine), h: LINE_H + PAD_Y };
  const usable = CHIP_MAXW - PAD_X;
  const lines = Math.min(2, Math.ceil((text.length * CHAR_W) / usable));
  return { w: CHIP_MAXW, h: lines * LINE_H + PAD_Y };
}

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
  // Global chip placement — one non-overlapping centre per conditioned edge,
  // avoiding every node, caption zone, and other chip. Parallel to layout.edges
  // (which is parallel to journey.flows), so chips[i] belongs to flows[i]. This
  // is the piece the React Flow migration had dropped — pills used to land at
  // the raw edge midpoint and pile up on the shapes.
  const chips = resolveChipPlacements(layout.edges, layout.nodes, measureChip);
  const edges: Edge[] = journey.flows.map((f, i) => ({
    id: `e${i}`,
    source: f.from,
    target: f.to,
    type: "bpmn",
    data: {
      condition: f.condition,
      chip: f.condition ? chips[i] : null,
      points: layout.edges[i]?.points,
    },
    markerEnd: { type: MarkerType.ArrowClosed, color: "var(--bpmn-border-em)" },
  }));
  return { nodes, edges };
}

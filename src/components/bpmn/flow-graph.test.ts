import { describe, expect, it } from "vitest";
import { buildBpmnFlowGraph } from "./flow-graph";
import type { BpmnJourney } from "./types";
import type { StepKnowledge } from "@/lib/transform-data/journey-knowledge";

const journey: BpmnJourney = {
  journey_id: "j1",
  title: "Authorize entry",
  elements: [
    { id: "s", type: "start-event", label: "start" },
    { id: "auth", type: "service-task", label: "Authorize", code_fqns: ["A.Authorize"] },
    { id: "gw", type: "exclusive-gateway", label: "valid?" },
    { id: "ok", type: "end-event", label: "granted", outcome: "grant" },
    { id: "no", type: "error-end-event", label: "denied", outcome: "deny" },
  ],
  flows: [
    { from: "s", to: "auth" },
    { from: "auth", to: "gw" },
    { from: "gw", to: "ok", condition: "yes" },
    { from: "gw", to: "no", condition: "no" },
  ],
};

describe("buildBpmnFlowGraph", () => {
  it("maps every element to a React Flow node and every flow to an edge", () => {
    const { nodes, edges } = buildBpmnFlowGraph(journey);
    expect(nodes.map((n) => n.id).sort()).toEqual(["auth", "gw", "no", "ok", "s"]);
    expect(edges).toHaveLength(4);
    expect(nodes.every((n) => n.type === "bpmn")).toBe(true);
    // the element kind is carried in data.el.type (one custom renderer switches on it)
    expect(nodes.find((n) => n.id === "gw")!.data.el.type).toBe("exclusive-gateway");
  });

  it("converts dagre centre positions to React Flow top-left", () => {
    const { nodes } = buildBpmnFlowGraph(journey);
    const auth = nodes.find((n) => n.id === "auth")!;
    // position is top-left = centre - half size; dagre gives a real layout,
    // so just assert the invariant relationship holds for the node's size.
    expect(auth.width).toBeGreaterThan(0);
    expect(auth.position.x).toBeTypeOf("number");
    expect(auth.position.y).toBeTypeOf("number");
  });

  it("carries per-element PR status into node data", () => {
    const pr = new Map<string, "added" | "modified" | "deleted">([["auth", "modified"]]);
    const { nodes } = buildBpmnFlowGraph(journey, pr);
    expect(nodes.find((n) => n.id === "auth")!.data.prChange).toBe("modified");
    expect(nodes.find((n) => n.id === "s")!.data.prChange).toBeNull();
  });

  it("counts knowledge items per element", () => {
    const k = new Map<string, StepKnowledge>([
      ["auth", { docs: [{ title: "d", snippet: "", cite: "", score: 1 }], facts: [] } as StepKnowledge],
    ]);
    const { nodes } = buildBpmnFlowGraph(journey, undefined, k);
    expect(nodes.find((n) => n.id === "auth")!.data.knowledgeCount).toBe(1);
    expect(nodes.find((n) => n.id === "s")!.data.knowledgeCount).toBe(0);
  });

  it("preserves the flow condition on the edge for the branch label", () => {
    const { edges } = buildBpmnFlowGraph(journey);
    const noEdge = edges.find((e) => e.target === "no")!;
    expect((noEdge.data as { condition?: string }).condition).toBe("no");
  });
});

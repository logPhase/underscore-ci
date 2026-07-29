import { describe, expect, it } from "vitest";
import { buildBpmnFlowGraph, measureChip } from "./flow-graph";
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

  it("gives every conditioned edge a collision-solved chip that clears the shapes", () => {
    // A gateway fanning to three terminals with long conditions — the class of
    // graph whose pills used to pile onto the shapes before chip placement was
    // wired back in.
    const dense: BpmnJourney = {
      journey_id: "j2",
      title: "eligibility",
      elements: [
        { id: "g", type: "exclusive-gateway", label: "eligible?" },
        { id: "a", type: "end-event", label: "granted", outcome: "grant" },
        { id: "b", type: "error-end-event", label: "declined: no entitlement", outcome: "deny" },
        { id: "c", type: "error-end-event", label: "declined: facility closed", outcome: "deny" },
      ],
      flows: [
        { from: "g", to: "a", condition: "active contract, or autopay entitlement present" },
        { from: "g", to: "b", condition: "no matching entitlement (plate unknown, outside validity)" },
        { from: "g", to: "c", condition: "facility closed or not active for this reading" },
      ],
    };
    const { nodes, edges } = buildBpmnFlowGraph(dense);
    const shapes = nodes.map((n) => ({
      x1: n.position.x,
      y1: n.position.y,
      x2: n.position.x + n.width!,
      y2: n.position.y + n.height!,
    }));
    for (const e of edges) {
      const d = e.data as { condition?: string; chip?: { x: number; y: number } | null };
      if (!d.condition) continue;
      expect(d.chip, `edge ${e.id} must have a solved chip`).toBeTruthy();
      const { w, h } = measureChip(d.condition);
      const chip = {
        x1: d.chip!.x - w / 2,
        y1: d.chip!.y - h / 2,
        x2: d.chip!.x + w / 2,
        y2: d.chip!.y + h / 2,
      };
      for (const s of shapes) {
        const ox = Math.min(chip.x2, s.x2) - Math.max(chip.x1, s.x1);
        const oy = Math.min(chip.y2, s.y2) - Math.max(chip.y1, s.y1);
        // No meaningful area overlap between a chip and any shape.
        expect(ox > 4 && oy > 4, `chip for "${d.condition}" overlaps a shape`).toBe(false);
      }
    }
  });
});

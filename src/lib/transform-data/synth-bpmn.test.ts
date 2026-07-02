import { describe, it, expect } from "vitest";
import { synthBpmnFromTrace } from "./synth-bpmn";

describe("synthBpmnFromTrace", () => {
  it("builds start → steps → end with one service-task per traced method", () => {
    const bpmn = synthBpmnFromTrace({
      journeyId: "j1",
      title: "Run A",
      entryFqn: "mod.A.run",
      steps: [
        { fqn: "mod.A.run", name: "run", class: "A" },
        { fqn: "mod.B.do", name: "do", class: "B" },
      ],
      edges: [{ from: "mod.A.run", to: "mod.B.do" }],
    });

    const starts = bpmn.elements.filter((e) => e.type === "start-event");
    const ends = bpmn.elements.filter((e) => e.type === "end-event");
    const tasks = bpmn.elements.filter((e) => e.type === "service-task");

    expect(starts).toHaveLength(1);
    expect(ends).toHaveLength(1);
    expect(tasks.map((t) => t.id)).toEqual(["mod.A.run", "mod.B.do"]);
    expect(tasks.find((t) => t.id === "mod.A.run")?.label).toBe("A.run");

    expect(bpmn.flows).toContainEqual({ from: starts[0].id, to: "mod.A.run" });
    expect(bpmn.flows).toContainEqual({ from: "mod.A.run", to: "mod.B.do" });
    expect(bpmn.flows).toContainEqual({ from: "mod.B.do", to: ends[0].id });
  });

  it("marks the diagram synthetic so it never masquerades as the AI diagram", () => {
    const bpmn = synthBpmnFromTrace({
      journeyId: "j-synth",
      title: "Synth",
      entryFqn: "mod.A.run",
      steps: [{ fqn: "mod.A.run", name: "run", class: "A" }],
      edges: [],
    });
    expect(bpmn.synthetic).toBe(true);
  });

  it("handles a single-step journey with no edges (start → step → end)", () => {
    const bpmn = synthBpmnFromTrace({
      journeyId: "j2",
      title: "Solo",
      entryFqn: "mod.S.only",
      steps: [{ fqn: "mod.S.only", name: "only", class: "S" }],
      edges: [],
    });
    const start = bpmn.elements.find((e) => e.type === "start-event")!;
    const end = bpmn.elements.find((e) => e.type === "end-event")!;
    expect(bpmn.elements.filter((e) => e.type === "service-task")).toHaveLength(
      1
    );
    expect(bpmn.flows).toContainEqual({ from: start.id, to: "mod.S.only" });
    expect(bpmn.flows).toContainEqual({ from: "mod.S.only", to: end.id });
  });

  it("falls back to the short FQN name when a step has no resolved name", () => {
    const bpmn = synthBpmnFromTrace({
      journeyId: "j3",
      title: "Bare",
      entryFqn: "pkg.mod.Klass.method",
      steps: [{ fqn: "pkg.mod.Klass.method" }],
      edges: [],
    });
    const task = bpmn.elements.find((e) => e.type === "service-task")!;
    expect(task.label).toBe("method");
  });
});

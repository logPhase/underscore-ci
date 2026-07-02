import { describe, it, expect } from "vitest";
import { transformChapters } from "./journeys";

const methods = {
  "mod.A.run": { name: "run", classFqn: "mod.A", file: "a.py" },
  "mod.B.do": { name: "do", classFqn: "mod.B", file: "b.py" },
} as unknown as Parameters<typeof transformChapters>[1];

describe("transformChapters BPMN synthesis (deterministic fallback)", () => {
  it("synthesizes a diagram from steps/edges when the AI bpmn is empty", () => {
    const { chapters } = transformChapters(
      [
        {
          id: "j1",
          entryFqn: "mod.A.run",
          title: "A",
          steps: [{ fqn: "mod.A.run" }, { fqn: "mod.B.do" }],
          edges: [["mod.A.run", "mod.B.do"]],
          bpmn: { journey_id: "j1", title: "A", elements: [], flows: [] },
        },
      ] as unknown as Parameters<typeof transformChapters>[0],
      methods,
      {} as Parameters<typeof transformChapters>[2]
    );
    const bpmn = chapters[0].bpmn!;
    expect(bpmn).toBeTruthy();
    expect(bpmn.elements.some((e) => e.type === "service-task")).toBe(true);
    expect(bpmn.elements.find((e) => e.id === "mod.A.run")?.label).toBe("A.run");
  });

  it("synthesizes when the journey has no bpmn field at all", () => {
    const { chapters } = transformChapters(
      [
        {
          id: "j2",
          entryFqn: "mod.A.run",
          title: "A",
          steps: [{ fqn: "mod.A.run" }],
          edges: [],
        },
      ] as unknown as Parameters<typeof transformChapters>[0],
      methods,
      {} as Parameters<typeof transformChapters>[2]
    );
    expect(
      chapters[0].bpmn?.elements.some((e) => e.type === "service-task")
    ).toBe(true);
  });

  it("passes a populated AI bpmn through unchanged", () => {
    const ai = {
      journey_id: "j3",
      title: "A",
      elements: [{ id: "x", type: "service-task", label: "X" }],
      flows: [],
    };
    const { chapters } = transformChapters(
      [
        {
          id: "j3",
          entryFqn: "mod.A.run",
          title: "A",
          steps: [{ fqn: "mod.A.run" }],
          edges: [],
          bpmn: ai,
        },
      ] as unknown as Parameters<typeof transformChapters>[0],
      methods,
      {} as Parameters<typeof transformChapters>[2]
    );
    expect(chapters[0].bpmn).toEqual(ai);
  });
});

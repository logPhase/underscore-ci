import { describe, expect, it } from "vitest";
import { layoutGraph } from "./layout";
import type { BpmnElement, BpmnFlow } from "./types";

const els = (assign: Record<string, string | undefined>): BpmnElement[] =>
  [
    { id: "s", type: "start-event", label: "In" },
    { id: "a", type: "service-task", label: "Ingest" },
    { id: "b", type: "service-task", label: "Score" },
    { id: "e", type: "end-event", label: "Done" },
  ].map((e) => ({ ...e, actor: assign[e.id] })) as BpmnElement[];

const flows: BpmnFlow[] = [
  { from: "s", to: "a" },
  { from: "a", to: "b" },
  { from: "b", to: "e" },
];

const LANES = [
  { id: "ingest", label: "Ingest service" },
  { id: "scoring", label: "Scoring service" },
];

describe("swim-lane layout pass", () => {
  it("stacks declared lanes into disjoint bands and keeps members inside", () => {
    const layout = layoutGraph(
      els({ s: "ingest", a: "ingest", b: "scoring", e: "scoring" }),
      flows,
      LANES
    );
    expect(layout.lanes).toHaveLength(2);
    const [l1, l2] = layout.lanes!;
    expect(l1.label).toBe("Ingest service");
    expect(l1.y + l1.h).toBeLessThanOrEqual(l2.y); // disjoint, ordered
    for (const n of layout.nodes) {
      const lane = ["s", "a"].includes(n.id) ? l1 : l2;
      expect(n.y - n.h / 2).toBeGreaterThanOrEqual(lane.y);
      expect(n.y + n.h / 2).toBeLessThanOrEqual(lane.y + lane.h);
    }
    expect(layout.height).toBeGreaterThanOrEqual(l2.y + l2.h);
  });

  it("unassigned nodes fall into a trailing unlabeled band", () => {
    const layout = layoutGraph(
      els({ a: "ingest", b: "scoring" }), // s and e carry no actor
      flows,
      LANES
    );
    expect(layout.lanes).toHaveLength(3);
    expect(layout.lanes![2].label).toBe("");
  });

  it("a single populated lane renders no lanes at all", () => {
    const layout = layoutGraph(
      els({ s: "ingest", a: "ingest", b: "ingest", e: "ingest" }),
      flows,
      LANES
    );
    expect(layout.lanes).toBeUndefined();
  });

  it("matches actors by label as well as id", () => {
    const layout = layoutGraph(
      els({ a: "Ingest service", b: "Scoring service", s: "ingest",
            e: "scoring" }),
      flows,
      LANES
    );
    expect(layout.lanes).toHaveLength(2);
  });
});

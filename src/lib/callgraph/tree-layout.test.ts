import { describe, expect, it } from "vitest";
import { buildCallGraphLayout, NODE_H } from "./tree-layout";
import type { Chapter } from "@/types/journey";

const chapter = {
  functions: ["A.run()", "B.load()", "C.save()"],
  edges: [
    ["A.run()", "B.load()"],
    ["B.load()", "C.save()"],
  ],
  steps: [
    { fqn: "A.run()", name: "run", class: "A", body: "x".repeat(200) },
    {
      fqn: "B.load()",
      name: "load",
      class: "B",
      body: "y".repeat(200),
      prStatus: "modified",
    },
    { fqn: "C.save()", name: "save", class: "C", body: "z".repeat(200) },
  ],
} as unknown as Chapter;

describe("buildCallGraphLayout", () => {
  it("shows only the root when nothing is expanded", () => {
    const { nodes, edges } = buildCallGraphLayout(chapter, new Set());
    expect(nodes.map((n) => n.fqn)).toEqual(["A.run()"]);
    expect(edges).toHaveLength(0);
  });

  it("reveals children as ancestors are expanded", () => {
    const { nodes, edges } = buildCallGraphLayout(
      chapter,
      new Set(["A.run()"]),
    );
    expect(nodes.map((n) => n.fqn).sort()).toEqual(["A.run()", "B.load()"]);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      from: { fqn: "A.run()" },
      to: { fqn: "B.load()" },
    });
  });

  it("lays out depth on the vertical axis and carries prStatus", () => {
    const { nodes } = buildCallGraphLayout(
      chapter,
      new Set(["A.run()", "B.load()"]),
    );
    const a = nodes.find((n) => n.fqn === "A.run()")!;
    const b = nodes.find((n) => n.fqn === "B.load()")!;
    expect(a.y).toBe(0);
    expect(b.y).toBe(NODE_H + 56); // depth 1 * (NODE_H + V_GAP)
    expect(b.prChange).toBe("modified");
  });

  it("marks an expandable node via childCount", () => {
    const { nodes } = buildCallGraphLayout(chapter, new Set());
    expect(nodes[0].childCount).toBeGreaterThan(0);
  });
});

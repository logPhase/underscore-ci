import { describe, expect, it } from "vitest";
import { iconKeyFor, layoutDiagram } from "./arch-diagram";
import type { ArchEdge, ArchNode } from "@/types/architecture";

const n = (id: string, kind: ArchNode["kind"], layer?: string): ArchNode =>
  ({ id, name: id, kind, layer: layer ?? null, description: `${id} desc` });

const NODES: ArchNode[] = [
  n("api", "service"), n("worker", "service"),
  n("db", "datastore"), n("bus", "topic"),
  n("kafka", "external"), n("cpms", "external"),
  n("comp1", "component", "domain"), n("comp2", "component", "domain"),
  n("comp3", "component", "edge"),
];
const EDGES: ArchEdge[] = [
  { id: "e1", from: "api", to: "db", kind: "data", label: "reads" },
  { id: "e2", from: "kafka", to: "worker", kind: "async", label: "consumes" },
  { id: "e3", from: "comp1", to: "comp2", kind: "dependency" },
  { id: "e4", from: "api", to: "ghost", kind: "sync" },      // dropped
];

describe("layoutDiagram — level 1 (containers)", () => {
  const L = layoutDiagram(NODES, EDGES, 1, "IRIS");

  it("places services in the first lane, persistence beneath, externals flanking", () => {
    const box = (id: string) => L.boxes.find((b) => b.id === id)!;
    expect(L.lanes.map((l) => l.label)).toEqual(
      ["Deployable units", "Persistence & messaging"]);
    expect(box("api").y).toBeLessThan(box("db").y);
    expect(box("kafka").external).toBe(true);
    // externals sit outside the boundary
    expect(box("kafka").x + box("kafka").w).toBeLessThanOrEqual(L.boundary.x);
    expect(box("cpms").x).toBeGreaterThanOrEqual(L.boundary.x + L.boundary.w);
    // components are NOT in the level-1 picture
    expect(L.boxes.find((b) => b.id === "comp1")).toBeUndefined();
  });

  it("labels the boundary as the software system", () => {
    expect(L.boundary.label).toBe("IRIS [Software System]");
  });

  it("draws only visible edges; labels only on boundary-crossing ones", () => {
    expect(L.edges).toHaveLength(2);              // e3 (components) + e4 (ghost) dropped
    // internal api→db keeps its LINE but drops the label (the mock labels
    // the edges that cross the system boundary); external kafka→worker keeps it
    expect(L.edges.map((e) => e.label).sort()).toEqual(["consumes", null].sort());
    for (const e of L.edges) expect(e.d).toMatch(/^M .+ C .+$/);
  });

  it("is deterministic", () => {
    expect(layoutDiagram(NODES, EDGES, 1, "IRIS")).toEqual(L);
  });
});

describe("layoutDiagram — level 2 (components by layer)", () => {
  const L = layoutDiagram(NODES, EDGES, 2, "IRIS");

  it("lanes per layer; services absent; component edge visible", () => {
    expect(L.lanes.map((l) => l.label).sort()).toEqual(["domain", "edge"]);
    expect(L.boxes.find((b) => b.id === "api")).toBeUndefined();
    expect(L.edges).toHaveLength(1);              // comp1 -> comp2
  });
});

describe("edges carry endpoints for hover focus", () => {
  it("each edge knows its from/to box ids", () => {
    const L = layoutDiagram(NODES, EDGES, 1, "IRIS");
    const kafka = L.edges.find((e) => e.label === "consumes")!;
    expect(kafka.from).toBe("kafka");
    expect(kafka.to).toBe("worker");
  });
});

describe("iconKeyFor — infographic node icons", () => {
  it("picks brandish icons from the node name", () => {
    expect(iconKeyFor("Redis", "datastore")).toBe("cache");
    expect(iconKeyFor("Session & facility cache", "datastore")).toBe("cache");
    expect(iconKeyFor("Postgres", "datastore")).toBe("database");
    expect(iconKeyFor("Azure Blob Storage", "datastore")).toBe("blob");
    expect(iconKeyFor("Kafka", "external")).toBe("topic");
    expect(iconKeyFor("MQTT Broker (edge)", "external")).toBe("broker");
    expect(iconKeyFor("ANPR Cameras", "external")).toBe("camera");
    expect(iconKeyFor("Azure Service Bus", "external")).toBe("cloud");
    expect(iconKeyFor("Motorist / Driver", "person")).toBe("user");
  });

  it("falls back by kind", () => {
    expect(iconKeyFor("Web API", "service")).toBe("service");
    expect(iconKeyFor("Domain Model", "component")).toBe("component");
    expect(iconKeyFor("anpr_reading_v2", "topic")).toBe("topic");
    expect(iconKeyFor("Some Vendor", "external")).toBe("external");
  });
});

describe("layoutDiagram — degradation", () => {
  it("no externals → boundary spans the full width", () => {
    const L = layoutDiagram([n("a", "service")], [], 1, "X");
    expect(L.boundary.x).toBe(0);
    expect(L.boxes[0].external).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { layoutArchitecture } from "./architecture-layout";
import type { ArchEdge, ArchLayer, ArchNode } from "@/types/architecture";

const layers: ArchLayer[] = [
  { id: "api", name: "API" },
  { id: "domain", name: "Domain" },
];

const nodes: ArchNode[] = [
  { id: "n1", name: "Controller", kind: "service", layer: "api" },
  { id: "n2", name: "Policy", kind: "component", layer: "domain" },
  { id: "t1", name: "anpr_v3", kind: "topic" }, // un-layered → systems band
  { id: "db", name: "Redis", kind: "datastore" }, // un-layered → systems band
];

const edges: ArchEdge[] = [
  { id: "e1", from: "n1", to: "n2", kind: "sync", label: "calls" },
  { id: "e2", from: "n2", to: "t1", kind: "async", label: "publishes" },
  { id: "e3", from: "n1", to: "ghost", kind: "dependency" }, // dangling target
];

describe("layoutArchitecture", () => {
  it("places every node and orders bands top-to-bottom by layer then systems", () => {
    const l = layoutArchitecture(nodes, edges, layers);
    expect(l.placed.size).toBe(4);
    // named layers first, systems band last
    expect(l.bands.map((b) => b.id)).toEqual(["api", "domain", "__systems"]);
    // api band sits above domain sits above systems
    const api = l.bands.find((b) => b.id === "api")!;
    const domain = l.bands.find((b) => b.id === "domain")!;
    const sys = l.bands.find((b) => b.id === "__systems")!;
    expect(api.y).toBeLessThan(domain.y);
    expect(domain.y).toBeLessThan(sys.y);
  });

  it("routes only edges whose endpoints both exist (drops dangling)", () => {
    const l = layoutArchitecture(nodes, edges, layers);
    expect(l.edges.map((r) => r.edge.id).sort()).toEqual(["e1", "e2"]);
    for (const r of l.edges) expect(r.d).toMatch(/^M /);
  });

  it("gives positive canvas dimensions", () => {
    const l = layoutArchitecture(nodes, edges, layers);
    expect(l.width).toBeGreaterThan(0);
    expect(l.height).toBeGreaterThan(0);
  });

  it("tolerates empty input", () => {
    const l = layoutArchitecture([], [], []);
    expect(l.nodes).toEqual([]);
    expect(l.edges).toEqual([]);
  });
});

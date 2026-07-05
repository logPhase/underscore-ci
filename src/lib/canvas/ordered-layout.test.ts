import type { MonoService } from "@/types/analysis";
import type { ServiceGroup } from "@/types/grouping";
import { describe, expect, it } from "vitest";
import { hashString, UNGROUPED_ID } from "./group-layout";
import {
  applyOrderedLayout,
  computePackageGrid,
  packageRadius,
  type PackageSize,
} from "./ordered-layout";

const svc = (id: string, radius = 100): MonoService => ({
  id,
  name: id,
  healthScore: 0.5,
  cx: 0,
  cy: 0,
  radius,
  seed: hashString(id),
  packages: [`${id}/pkg`],
});

const group = (id: string, services: string[]): ServiceGroup => ({
  id,
  name: id,
  description: `${id} group`,
  services,
});

type Dep = { from: string; to: string; importCount?: number };

const dist = (
  a: { cx: number; cy: number },
  b: { cx: number; cy: number }
): number => Math.hypot(a.cx - b.cx, a.cy - b.cy);

// A small but realistic clean-architecture shape: api → app → domain, with
// infra also importing app + domain and a weak app → infra back-edge (a cycle).
const services = [
  svc("api-svc"),
  svc("app-svc"),
  svc("domain-svc"),
  svc("infra-svc"),
  svc("tools-svc"),
];

const groups = [
  group("api", ["api-svc"]),
  group("application", ["app-svc"]),
  group("domain", ["domain-svc"]),
  group("infrastructure", ["infra-svc", "tools-svc"]),
];

const deps: Dep[] = [
  { from: "api-svc", to: "app-svc", importCount: 1 },
  { from: "app-svc", to: "domain-svc", importCount: 73 },
  { from: "app-svc", to: "infra-svc", importCount: 2 }, // weak back-edge
  { from: "infra-svc", to: "app-svc", importCount: 12 },
  { from: "infra-svc", to: "domain-svc", importCount: 56 },
];

// Per-service package file counts (varied, to exercise radius growth).
const packagesByService = new Map<string, PackageSize[]>([
  ["api-svc", [{ name: "api-svc/pkg", fileCount: 4 }]],
  ["app-svc", [{ name: "app-svc/pkg", fileCount: 17 }]],
  ["domain-svc", [{ name: "domain-svc/pkg", fileCount: 24 }]],
  ["infra-svc", [{ name: "infra-svc/pkg", fileCount: 35 }]],
  ["tools-svc", [{ name: "tools-svc/pkg", fileCount: 2 }]],
]);

const columnOf = (
  regions: { cx: number; serviceIds: string[] }[]
): Map<string, number> => {
  const xs = [...new Set(regions.map((r) => r.cx))].sort((a, b) => a - b);
  const colByX = new Map(xs.map((x, i) => [x, i]));
  const out = new Map<string, number>();
  for (const r of regions) out.set(r.serviceIds.join(","), colByX.get(r.cx)!);
  return out;
};

const groupColumn = (
  result: ReturnType<typeof applyOrderedLayout>,
  groupId: string
): number => {
  const xs = [...new Set(result.groupRegions.map((r) => r.cx))].sort(
    (a, b) => a - b
  );
  const region = result.groupRegions.find((r) => r.id === groupId)!;
  return xs.indexOf(region.cx);
};

describe("computePackageGrid", () => {
  it("is deterministic and order-insensitive on input", () => {
    const a = computePackageGrid([
      { name: "b", fileCount: 5 },
      { name: "a", fileCount: 12 },
      { name: "c", fileCount: 5 },
    ]);
    const b = computePackageGrid([
      { name: "c", fileCount: 5 },
      { name: "a", fileCount: 12 },
      { name: "b", fileCount: 5 },
    ]);
    expect(a).toEqual(b);
  });

  it("orders cells by file count desc then name", () => {
    const grid = computePackageGrid([
      { name: "small", fileCount: 2 },
      { name: "big", fileCount: 20 },
      { name: "mid-b", fileCount: 8 },
      { name: "mid-a", fileCount: 8 },
    ]);
    expect(grid.cells.map((c) => c.name)).toEqual([
      "big",
      "mid-a",
      "mid-b",
      "small",
    ]);
  });

  it("contains every cell within the service radius", () => {
    const grid = computePackageGrid([
      { name: "a", fileCount: 35 },
      { name: "b", fileCount: 24 },
      { name: "c", fileCount: 19 },
      { name: "d", fileCount: 10 },
      { name: "e", fileCount: 4 },
      { name: "f", fileCount: 2 },
    ]);
    for (const c of grid.cells)
      expect(Math.hypot(c.dx, c.dy) + c.radius).toBeLessThanOrEqual(grid.radius);
  });

  it("never overlaps two cells", () => {
    const grid = computePackageGrid([
      { name: "a", fileCount: 35 },
      { name: "b", fileCount: 3 },
      { name: "c", fileCount: 19 },
      { name: "d", fileCount: 30 },
      { name: "e", fileCount: 1 },
    ]);
    for (let i = 0; i < grid.cells.length; i++)
      for (let j = i + 1; j < grid.cells.length; j++) {
        const a = grid.cells[i];
        const b = grid.cells[j];
        expect(Math.hypot(a.dx - b.dx, a.dy - b.dy)).toBeGreaterThan(
          a.radius + b.radius
        );
      }
  });

  it("centers a single package on the origin", () => {
    const grid = computePackageGrid([{ name: "solo", fileCount: 9 }]);
    expect(grid.cells[0].dx).toBe(0);
    expect(grid.cells[0].dy).toBe(0);
    expect(grid.radius).toBeGreaterThan(packageRadius(9));
  });
});

describe("applyOrderedLayout", () => {
  it("is deterministic — same inputs, identical output (#19)", () => {
    const first = applyOrderedLayout(services, groups, deps, packagesByService);
    const second = applyOrderedLayout(
      services.map((s) => ({ ...s })),
      groups.map((g) => ({ ...g, services: [...g.services] })),
      deps.map((d) => ({ ...d })),
      new Map(packagesByService)
    );
    expect(second).toEqual(first);
  });

  it("is order-insensitive on group / dependency input order", () => {
    const shuffledGroups = [groups[3], groups[1], groups[0], groups[2]];
    const shuffledDeps = [deps[4], deps[0], deps[2], deps[1], deps[3]];
    expect(
      applyOrderedLayout(services, shuffledGroups, shuffledDeps, packagesByService)
    ).toEqual(applyOrderedLayout(services, groups, deps, packagesByService));
  });

  it("preserves every service id and seed; grows radius to fit the grid", () => {
    const { services: out } = applyOrderedLayout(
      services,
      groups,
      deps,
      packagesByService
    );
    expect(out.map((s) => s.id)).toEqual(services.map((s) => s.id));
    out.forEach((s, i) => {
      expect(s.seed).toBe(services[i].seed);
      const expected = computePackageGrid(packagesByService.get(s.id)!).radius;
      expect(s.radius).toBe(expected);
    });
  });

  it("layers importers left of what they import (A imports B ⇒ col(A) < col(B))", () => {
    const result = applyOrderedLayout(services, groups, deps, packagesByService);
    // app imports domain (kept edge) → application left of domain.
    expect(groupColumn(result, "application")).toBeLessThan(
      groupColumn(result, "domain")
    );
    // api imports app → api left of application.
    expect(groupColumn(result, "api")).toBeLessThan(
      groupColumn(result, "application")
    );
    // infra imports app (dominant 12>2) → infrastructure left of application.
    expect(groupColumn(result, "infrastructure")).toBeLessThan(
      groupColumn(result, "application")
    );
    // The weak app→infra back-edge (2) was dropped, so the diagram still flows
    // left→right without a contradiction.
  });

  it("keeps every service inside its group hull", () => {
    const { services: out, groupRegions } = applyOrderedLayout(
      services,
      groups,
      deps,
      packagesByService
    );
    const byId = new Map(out.map((s) => [s.id, s]));
    for (const region of groupRegions)
      for (const id of region.serviceIds) {
        const member = byId.get(id)!;
        expect(dist(member, region) + member.radius).toBeLessThanOrEqual(
          region.radius + 1
        );
      }
  });

  it("never overlaps services within a group, nor group hulls with each other", () => {
    const { services: out, groupRegions } = applyOrderedLayout(
      services,
      groups,
      deps,
      packagesByService
    );
    const byId = new Map(out.map((s) => [s.id, s]));
    // Services within a group.
    for (const region of groupRegions) {
      const members = region.serviceIds.map((id) => byId.get(id)!);
      for (let i = 0; i < members.length; i++)
        for (let j = i + 1; j < members.length; j++)
          expect(dist(members[i], members[j])).toBeGreaterThan(
            members[i].radius + members[j].radius
          );
    }
    // Group hulls with each other.
    for (let i = 0; i < groupRegions.length; i++)
      for (let j = i + 1; j < groupRegions.length; j++)
        expect(dist(groupRegions[i], groupRegions[j])).toBeGreaterThan(
          groupRegions[i].radius + groupRegions[j].radius
        );
  });

  it("stays roughly centred on the world origin (400, 300)", () => {
    const { groupRegions } = applyOrderedLayout(
      services,
      groups,
      deps,
      packagesByService
    );
    const cxs = groupRegions.map((r) => r.cx);
    const mid = (Math.min(...cxs) + Math.max(...cxs)) / 2;
    // Column mid-run centres on WORLD_CX within a column's half-width.
    expect(Math.abs(mid - 400)).toBeLessThan(600);
  });

  describe("fallbacks", () => {
    it("puts every group in a single column when there are no dependencies", () => {
      const result = applyOrderedLayout(services, groups, [], packagesByService);
      const cols = new Set(result.groupRegions.map((r) => r.cx));
      expect(cols.size).toBe(1);
    });

    it("parks edgeless groups in the last column", () => {
      // Only api↔app connected; domain + infrastructure have no edges.
      const partialDeps: Dep[] = [
        { from: "api-svc", to: "app-svc", importCount: 5 },
      ];
      const result = applyOrderedLayout(
        services,
        groups,
        partialDeps,
        packagesByService
      );
      const cols = columnOf(result.groupRegions);
      const apiCol = groupColumn(result, "api");
      const appCol = groupColumn(result, "application");
      const lastCol = Math.max(...[...cols.values()]);
      expect(apiCol).toBeLessThan(appCol);
      expect(groupColumn(result, "domain")).toBe(lastCol);
      expect(groupColumn(result, "infrastructure")).toBe(lastCol);
    });

    it("terminates and places all groups when the group graph is fully cyclic", () => {
      const cyclicDeps: Dep[] = [
        { from: "api-svc", to: "app-svc", importCount: 4 },
        { from: "app-svc", to: "domain-svc", importCount: 4 },
        { from: "domain-svc", to: "infra-svc", importCount: 4 },
        { from: "infra-svc", to: "api-svc", importCount: 4 }, // closes the loop
      ];
      const result = applyOrderedLayout(
        services,
        groups,
        cyclicDeps,
        packagesByService
      );
      expect(result.groupRegions).toHaveLength(4);
      // Every service still received a position.
      for (const s of result.services)
        expect(Number.isFinite(s.cx) && Number.isFinite(s.cy)).toBe(true);
    });

    it("sweeps unassigned services into an Ungrouped hull", () => {
      const partial = [group("api", ["api-svc"])];
      const { groupRegions } = applyOrderedLayout(
        services,
        partial,
        [],
        packagesByService
      );
      const ungrouped = groupRegions.find((g) => g.id === UNGROUPED_ID);
      expect(ungrouped).toBeDefined();
      expect(ungrouped!.serviceIds.sort()).toEqual(
        ["app-svc", "domain-svc", "infra-svc", "tools-svc"].sort()
      );
    });

    it("returns empty regions for no services", () => {
      const { services: out, groupRegions } = applyOrderedLayout(
        [],
        [],
        [],
        new Map()
      );
      expect(out).toEqual([]);
      expect(groupRegions).toEqual([]);
    });
  });
});

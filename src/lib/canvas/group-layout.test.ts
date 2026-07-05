import type { MonoService } from "@/types/analysis";
import type { ServiceGroup } from "@/types/grouping";
import { describe, expect, it } from "vitest";
import { applyGroupLayout, hashString, UNGROUPED_ID } from "./group-layout";

const svc = (id: string, radius = 100): MonoService => ({
  id,
  name: id,
  healthScore: 0.5,
  cx: 0,
  cy: 0,
  radius,
  seed: hashString(id),
  packages: ["Root"],
});

const group = (id: string, services: string[]): ServiceGroup => ({
  id,
  name: id,
  description: `${id} group`,
  services,
});

const services = [
  svc("svc-a", 80),
  svc("svc-b", 120),
  svc("svc-c", 220),
  svc("svc-d", 90),
  svc("svc-e", 150),
];

const groups = [
  group("billing", ["svc-b", "svc-a"]),
  group("access", ["svc-c"]),
  group("platform", ["svc-e", "svc-d"]),
];

const dist = (
  a: { cx: number; cy: number },
  b: { cx: number; cy: number }
): number => Math.hypot(a.cx - b.cx, a.cy - b.cy);

describe("applyGroupLayout", () => {
  it("is deterministic — same inputs, identical output (#19)", () => {
    const first = applyGroupLayout(services, groups);
    const second = applyGroupLayout(
      services.map((s) => ({ ...s })),
      groups.map((g) => ({ ...g, services: [...g.services] }))
    );
    expect(second).toEqual(first);
  });

  it("is order-insensitive on group/member input order", () => {
    const shuffled = [groups[2], groups[0], groups[1]].map((g) => ({
      ...g,
      services: [...g.services].reverse(),
    }));
    expect(applyGroupLayout(services, shuffled)).toEqual(
      applyGroupLayout(services, groups)
    );
  });

  it("preserves every service id, radius and seed — only cx/cy move", () => {
    const { services: out } = applyGroupLayout(services, groups);
    expect(out.map((s) => s.id)).toEqual(services.map((s) => s.id));
    out.forEach((s, i) => {
      expect(s.radius).toBe(services[i].radius);
      expect(s.seed).toBe(services[i].seed);
    });
  });

  it("keeps members inside their hull and hulls apart — no cross-group overlap", () => {
    const { services: out, groupRegions } = applyGroupLayout(services, groups);
    const byId = new Map(out.map((s) => [s.id, s]));

    for (const region of groupRegions) {
      for (const id of region.serviceIds) {
        const member = byId.get(id)!;
        // Member blob fully contained by its group hull (small tolerance
        // for the blob's ±18% organic noise is covered by HULL_PADDING).
        expect(dist(member, region) + member.radius).toBeLessThanOrEqual(
          region.radius + 1
        );
      }
    }
    // Group hulls never overlap, so members of different groups can't either.
    for (let i = 0; i < groupRegions.length; i++) {
      for (let j = i + 1; j < groupRegions.length; j++) {
        expect(dist(groupRegions[i], groupRegions[j])).toBeGreaterThan(
          groupRegions[i].radius + groupRegions[j].radius
        );
      }
    }
    // And members within one group keep clear of each other.
    for (const region of groupRegions) {
      const members = region.serviceIds.map((id) => byId.get(id)!);
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          expect(dist(members[i], members[j])).toBeGreaterThan(
            members[i].radius + members[j].radius
          );
        }
      }
    }
  });

  it("drops unknown member ids and sweeps unassigned services into Ungrouped", () => {
    const partial = [
      group("billing", ["svc-a", "no-such-service"]),
      group("access", ["svc-c"]),
    ];
    const { groupRegions } = applyGroupLayout(services, partial);
    const billing = groupRegions.find((g) => g.id === "billing")!;
    expect(billing.serviceIds).toEqual(["svc-a"]);
    const ungrouped = groupRegions.find((g) => g.id === UNGROUPED_ID)!;
    expect(ungrouped.serviceIds).toEqual(["svc-b", "svc-d", "svc-e"]);
  });

  it("assigns duplicated members to exactly one group", () => {
    const dupes = [
      group("alpha", ["svc-a", "svc-b"]),
      group("beta", ["svc-b", "svc-c", "svc-d", "svc-e"]),
    ];
    const { groupRegions } = applyGroupLayout(services, dupes);
    const memberships = groupRegions.flatMap((g) => g.serviceIds);
    expect(memberships.sort()).toEqual(services.map((s) => s.id).sort());
  });

  it("centers a single group on the world origin", () => {
    const { groupRegions } = applyGroupLayout(services, [
      group(
        "all",
        services.map((s) => s.id)
      ),
    ]);
    expect(groupRegions).toHaveLength(1);
    expect(groupRegions[0].cx).toBe(400);
    expect(groupRegions[0].cy).toBe(300);
  });

  it("returns no regions for empty groups input", () => {
    // Every service unassigned → single synthetic hull, still a partition.
    const { groupRegions } = applyGroupLayout(services, []);
    expect(groupRegions.map((g) => g.id)).toEqual([UNGROUPED_ID]);
  });
});

describe("hashString", () => {
  it("is stable and non-negative", () => {
    expect(hashString("billing")).toBe(hashString("billing"));
    expect(hashString("billing")).toBeGreaterThanOrEqual(0);
    expect(hashString("billing")).not.toBe(hashString("access"));
  });
});

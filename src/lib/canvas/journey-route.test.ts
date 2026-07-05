import { describe, expect, it } from "vitest";
import type { JourneyData } from "@/store/use-journey-store";
import type { PositionedGroupRegion } from "@/types/grouping";
import { deriveJourneyRoute } from "./journey-route";

const step = (fqn: string, service: string, prStatus?: string) => ({
  fqn,
  name: fqn.split(".").pop() ?? fqn,
  class: "C",
  service,
  file: `${service}/f.cs`,
  phaseIdx: 0,
  ...(prStatus ? { prStatus } : {}),
});

const journey = (steps: ReturnType<typeof step>[]): JourneyData => ({
  id: "j1",
  title: "Test",
  entryFqn: steps[0]?.fqn ?? "",
  handlerType: "http",
  phases: [],
  steps,
  edges: [],
});

const region = (
  id: string,
  serviceIds: string[]
): PositionedGroupRegion => ({
  id,
  name: id.toUpperCase(),
  description: "",
  cx: 0,
  cy: 0,
  radius: 100,
  seed: 1,
  serviceIds,
});

const GROUPS = [
  region("api", ["WebApi"]),
  region("core", ["Application", "Domain"]),
  region("infra", ["Infrastructure"]),
];

describe("deriveJourneyRoute", () => {
  it("collapses consecutive same-component steps into one stop", () => {
    const r = deriveJourneyRoute(
      journey([
        step("A.a", "WebApi"),
        step("B.b", "Application"),
        step("C.c", "Domain"), // same group as Application → same stop
        step("D.d", "Infrastructure"),
      ]),
      GROUPS,
      new Map()
    );
    expect(r.stops.map((s) => s.key)).toEqual(["api", "core", "infra"]);
    expect(r.stops.map((s) => s.seq)).toEqual([1, 2, 3]);
    expect(r.stops[1].stepCount).toBe(2);
    expect(r.stops[1].serviceIds).toEqual(["Application", "Domain"]);
    expect(r.legs).toEqual([
      { from: "api", to: "core" },
      { from: "core", to: "infra" },
    ]);
  });

  it("keeps revisit legs but not duplicate stops", () => {
    const r = deriveJourneyRoute(
      journey([
        step("A.a", "WebApi"),
        step("B.b", "Application"),
        step("C.c", "WebApi"), // back to api
      ]),
      GROUPS,
      new Map()
    );
    expect(r.stops.map((s) => s.key)).toEqual(["api", "core"]);
    expect(r.stops[0].stepCount).toBe(2);
    expect(r.legs).toEqual([
      { from: "api", to: "core" },
      { from: "core", to: "api" },
    ]);
  });

  it("counts PR-changed steps per stop", () => {
    const r = deriveJourneyRoute(
      journey([
        step("A.a", "WebApi", "modified"),
        step("B.b", "Application"),
        step("C.c", "Domain", "added"),
      ]),
      GROUPS,
      new Map()
    );
    expect(r.stops.find((s) => s.key === "api")?.changedSteps).toBe(1);
    expect(r.stops.find((s) => s.key === "core")?.changedSteps).toBe(1);
  });

  it("falls back to service-level stops without groups", () => {
    const names = new Map([["WebApi", "Web API"]]);
    const r = deriveJourneyRoute(
      journey([step("A.a", "WebApi"), step("B.b", "Domain")]),
      null,
      names
    );
    expect(r.stops.map((s) => s.kind)).toEqual(["service", "service"]);
    expect(r.stops[0].name).toBe("Web API");
    expect(r.stops[1].name).toBe("Domain"); // id fallback
  });

  it("counts unmappable steps instead of inventing stops", () => {
    const r = deriveJourneyRoute(
      journey([step("A.a", ""), step("B.b", "WebApi")]),
      GROUPS,
      new Map()
    );
    expect(r.unmappedSteps).toBe(1);
    expect(r.stops).toHaveLength(1);
  });
});

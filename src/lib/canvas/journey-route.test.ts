import { describe, expect, it } from "vitest";
import type { JourneyData } from "@/store/use-journey-store";
import type {
  FileComponentRef,
  PositionedGroupRegion,
} from "@/types/grouping";
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

/** Step variant that sets an explicit file path, so it resolves through a
 *  fileToComponent map in component mode. */
const cstep = (
  fqn: string,
  service: string,
  file: string,
  prStatus?: string
) => ({
  fqn,
  name: fqn.split(".").pop() ?? fqn,
  class: "C",
  service,
  file,
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

// ── Component mode (fileGroups present) ──────────────────────────────────
// Finer than group/service mode: a stop is a functional component scoped to a
// service (`${service}::${componentId}`).

const ref = (
  componentId: string,
  componentName: string,
  service: string
): FileComponentRef => ({ componentId, componentName, service });

const F2C = new Map<string, FileComponentRef>([
  ["WebApi/PlateController.cs", ref("plate-matching", "Plate Matching", "WebApi")],
  ["WebApi/PlateService.cs", ref("plate-matching", "Plate Matching", "WebApi")],
  ["WebApi/KafkaConsumer.cs", ref("kafka-consumers", "Kafka Consumers", "WebApi")],
  [
    "Application/PlateMatcher.cs",
    ref("plate-matching", "Plate Matching", "Application"),
  ],
]);

describe("deriveJourneyRoute — component mode", () => {
  it("collapses consecutive same-component steps and splits distinct ones", () => {
    const r = deriveJourneyRoute(
      journey([
        cstep("A.a", "WebApi", "WebApi/PlateController.cs"),
        cstep("A.b", "WebApi", "WebApi/PlateService.cs"), // same component → collapse
        cstep("A.c", "WebApi", "WebApi/KafkaConsumer.cs"), // different component → new stop
        cstep("B.a", "Application", "Application/PlateMatcher.cs"), // same name, other service → new stop
      ]),
      null,
      new Map([["WebApi", "Web API"]]),
      F2C
    );
    expect(r.stops.map((s) => s.key)).toEqual([
      "WebApi::plate-matching",
      "WebApi::kafka-consumers",
      "Application::plate-matching",
    ]);
    expect(r.stops.map((s) => s.kind)).toEqual([
      "component",
      "component",
      "component",
    ]);
    expect(r.stops.map((s) => s.name)).toEqual([
      "Plate Matching",
      "Kafka Consumers",
      "Plate Matching",
    ]);
    expect(r.stops[0].stepCount).toBe(2);
    expect(r.stops[0].serviceIds).toEqual(["WebApi"]);
    expect(r.stops[2].serviceIds).toEqual(["Application"]);
    expect(r.legs).toEqual([
      { from: "WebApi::plate-matching", to: "WebApi::kafka-consumers" },
      { from: "WebApi::kafka-consumers", to: "Application::plate-matching" },
    ]);
  });

  it("keeps revisit legs but not duplicate component stops", () => {
    const r = deriveJourneyRoute(
      journey([
        cstep("A.a", "WebApi", "WebApi/PlateController.cs"),
        cstep("A.c", "WebApi", "WebApi/KafkaConsumer.cs"),
        cstep("A.d", "WebApi", "WebApi/PlateService.cs"), // back to plate-matching
      ]),
      null,
      new Map(),
      F2C
    );
    expect(r.stops.map((s) => s.key)).toEqual([
      "WebApi::plate-matching",
      "WebApi::kafka-consumers",
    ]);
    expect(r.stops[0].stepCount).toBe(2);
    expect(r.legs).toEqual([
      { from: "WebApi::plate-matching", to: "WebApi::kafka-consumers" },
      { from: "WebApi::kafka-consumers", to: "WebApi::plate-matching" },
    ]);
  });

  it("falls back to a service stop when no component owns the file", () => {
    const r = deriveJourneyRoute(
      journey([
        cstep("A.a", "WebApi", "WebApi/PlateController.cs"),
        cstep("A.z", "WebApi", "WebApi/Unmapped.cs"), // leftover — no component
      ]),
      GROUPS, // present, but component mode never drops to group
      new Map([["WebApi", "Web API"]]),
      F2C
    );
    expect(r.stops.map((s) => s.kind)).toEqual(["component", "service"]);
    expect(r.stops[1].key).toBe("WebApi");
    expect(r.stops[1].name).toBe("Web API");
  });

  it("takes precedence over groups when both are present", () => {
    const r = deriveJourneyRoute(
      journey([cstep("A.a", "WebApi", "WebApi/PlateController.cs")]),
      GROUPS,
      new Map(),
      F2C
    );
    expect(r.stops[0].kind).toBe("component");
    expect(r.stops[0].key).toBe("WebApi::plate-matching");
  });

  it("counts PR-changed steps per component stop", () => {
    const r = deriveJourneyRoute(
      journey([
        cstep("A.a", "WebApi", "WebApi/PlateController.cs", "modified"),
        cstep("A.c", "WebApi", "WebApi/KafkaConsumer.cs"),
      ]),
      null,
      new Map(),
      F2C
    );
    expect(
      r.stops.find((s) => s.key === "WebApi::plate-matching")?.changedSteps
    ).toBe(1);
    expect(
      r.stops.find((s) => s.key === "WebApi::kafka-consumers")?.changedSteps
    ).toBe(0);
  });

  it("falls back to group/service mode when the map is empty", () => {
    const r = deriveJourneyRoute(
      journey([step("A.a", "WebApi"), step("B.b", "Application")]),
      GROUPS,
      new Map(),
      new Map() // empty → not component mode
    );
    expect(r.stops.map((s) => s.kind)).toEqual(["group", "group"]);
  });
});

import {
  latestByCapability,
  previousVersionOf,
  removedCapabilities,
} from "./history";
import type { SpecHistoryEvent } from "@/types/specs";

const ev = (
  version_id: string,
  capability: string,
  operation: SpecHistoryEvent["operation"],
  at: string
): SpecHistoryEvent => ({
  version_id,
  capability,
  path: `/specs/${capability}/spec.md`,
  operation,
  at,
  size: 100,
  sha256: `sha-${version_id}`,
});

// Newest first, as the API returns it.
const HISTORY: SpecHistoryEvent[] = [
  ev("v5", "plates", "updated", "2026-07-02T10:00:00Z"),
  ev("v4", "gates", "deleted", "2026-07-01T12:00:00Z"),
  ev("v3", "plates", "updated", "2026-07-01T09:00:00Z"),
  ev("v2", "gates", "created", "2026-06-30T08:00:00Z"),
  ev("v1", "plates", "created", "2026-06-29T08:00:00Z"),
];

describe("previousVersionOf", () => {
  it("finds the next-older version of the same capability", () => {
    expect(previousVersionOf(HISTORY, "v5")?.version_id).toBe("v3");
    expect(previousVersionOf(HISTORY, "v3")?.version_id).toBe("v1");
  });

  it("returns null for a capability's first version", () => {
    expect(previousVersionOf(HISTORY, "v1")).toBeNull();
    expect(previousVersionOf(HISTORY, "v2")).toBeNull();
  });

  it("returns null for an unknown version id", () => {
    expect(previousVersionOf(HISTORY, "nope")).toBeNull();
  });
});

describe("latestByCapability", () => {
  it("picks the newest event per capability", () => {
    const latest = latestByCapability(HISTORY);

    expect(latest.get("plates")?.version_id).toBe("v5");
    expect(latest.get("gates")?.version_id).toBe("v4");
  });

  it("is empty for empty history", () => {
    expect(latestByCapability([]).size).toBe(0);
  });
});

describe("removedCapabilities", () => {
  it("lists capabilities whose latest event is deleted and that have no living spec", () => {
    const removed = removedCapabilities(HISTORY, ["plates"]);

    expect(removed.map((r) => r.capability)).toEqual(["gates"]);
    expect(removed[0].version_id).toBe("v4");
  });

  it("does not list a deleted-then-recreated capability that lives again", () => {
    const removed = removedCapabilities(HISTORY, ["plates", "gates"]);

    expect(removed).toEqual([]);
  });
});

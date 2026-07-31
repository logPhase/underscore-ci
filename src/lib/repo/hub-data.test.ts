import { describe, expect, it } from "vitest";
import {
  buildActivity,
  classifyEars,
  groupPrs,
  heroStats,
  liveRequirementCount,
  prStateTabs,
  revisedThisWeek,
  weeklyCells,
} from "./hub-data";
import type { SpecHistoryEvent } from "@/types/specs";

const NOW = Date.parse("2026-07-31T12:00:00Z");
const ev = (at: string, op = "updated", capability = "cap"): SpecHistoryEvent =>
  ({ version_id: at, capability, path: "", operation: op, at, size: 1, sha256: "" });

describe("heroStats", () => {
  it("splits containers vs components and drops zero rows", () => {
    const arch = {
      layers: [], edges: [{ id: "e1" }, { id: "e2" }] as never[],
      nodes: [
        { id: "1", name: "", kind: "service" },
        { id: "2", name: "", kind: "datastore" },
        { id: "3", name: "", kind: "topic" },
        { id: "4", name: "", kind: "component" },
        { id: "5", name: "", kind: "external" },
      ] as never[],
    };
    const stats = heroStats(arch as never, { repo_id: "r", specs: [{}, {}], history: [], versions: {} } as never, [{ title: "t", url: "u" }]);
    expect(stats).toEqual([
      { value: 3, label: "containers" },
      { value: 1, label: "components" },
      { value: 2, label: "integrations" },
      { value: 2, label: "capabilities" },
      { value: 1, label: "pull requests" },
    ]);
  });

  it("degrades without architecture", () => {
    const stats = heroStats(null, null, []);
    expect(stats).toEqual([]);
  });
});

describe("classifyEars", () => {
  it("classifies by leading keyword", () => {
    expect(classifyEars("When an event arrives, the system shall deny.")).toBe("event-driven");
    expect(classifyEars("While disabled, the system shall respond.")).toBe("state-driven");
    expect(classifyEars("If the plate is unknown, deny.")).toBe("unwanted behaviour");
    expect(classifyEars("Where a grace period exists, grant re-entry.")).toBe("optional feature");
    expect(classifyEars("The system shall evaluate every event.")).toBe("ubiquitous");
    expect(classifyEars("**When** bold leading markdown")).toBe("event-driven");
  });
});

describe("liveRequirementCount", () => {
  it("counts REQ blocks across specs", () => {
    const specs = { repo_id: "r", history: [], versions: {}, specs: [
      { capability: "a", path: "", content: "# T\n\n1. The system SHALL x.\n2. WHEN y the system SHALL z.\n" },
      { capability: "b", path: "", content: "intro only, no numbered reqs" },
    ] };
    expect(liveRequirementCount(specs as never)).toBeGreaterThanOrEqual(2);
  });
});

describe("weeklyCells", () => {
  it("buckets events into trailing weeks, newest last, loudest op wins", () => {
    const cells = weeklyCells([
      ev("2026-07-30T00:00:00Z", "updated"),   // this week
      ev("2026-07-29T00:00:00Z", "deleted"),   // this week — outranks updated
      ev("2026-07-20T00:00:00Z", "created"),   // ~1.6 weeks back
      ev("2026-01-01T00:00:00Z", "updated"),   // far outside the window
    ], 4, NOW);
    expect(cells).toHaveLength(4);
    expect(cells[3].op).toBe("deleted");
    expect(cells[2].op).toBe("created");
    expect(cells[0].op).toBeNull();
  });
});

describe("revisedThisWeek", () => {
  it("counts only the trailing 7 days", () => {
    expect(revisedThisWeek([ev("2026-07-30T00:00:00Z"), ev("2026-07-01T00:00:00Z")], NOW)).toBe(1);
  });
});

describe("groupPrs", () => {
  const prs = [
    { number: 1, title: "Old fix", url: "a/", updatedAt: "2026-06-01T00:00:00Z", state: "merged" },
    { number: 2, title: "Today fix", url: "b/", updatedAt: "2026-07-31T09:00:00Z", author: "rin", state: "open" },
    { number: 3, title: "Yesterday feat", url: "c/", updatedAt: "2026-07-30T09:00:00Z" },
  ];

  it("groups newest-first into recency buckets", () => {
    const groups = groupPrs(prs, "", NOW);
    expect(groups.map((g) => g.label)).toEqual(["today", "yesterday", "earlier"]);
    expect(groups[0].prs[0].number).toBe(2);
  });

  it("filters by number, title, and author", () => {
    expect(groupPrs(prs, "#3", NOW).flatMap((g) => g.prs)).toHaveLength(1);
    expect(groupPrs(prs, "rin", NOW).flatMap((g) => g.prs)[0].number).toBe(2);
    expect(groupPrs(prs, "feat", NOW).flatMap((g) => g.prs)[0].number).toBe(3);
  });

  it("filters by state when one is selected", () => {
    const merged = groupPrs(prs, "", NOW, "merged").flatMap((g) => g.prs);
    expect(merged.map((p) => p.number)).toEqual([1]);
    const all = groupPrs(prs, "", NOW, null).flatMap((g) => g.prs);
    expect(all).toHaveLength(3);
  });
});

describe("prStateTabs", () => {
  it("counts states, All first, only states that exist", () => {
    const tabs = prStateTabs([
      { title: "a", url: "a/", state: "merged" },
      { title: "b", url: "b/", state: "merged" },
      { title: "c", url: "c/", state: "open" },
      { title: "d", url: "d/" },
    ]);
    expect(tabs).toEqual([
      { state: null, label: "All", count: 4 },
      { state: "open", label: "Open", count: 1 },
      { state: "merged", label: "Merged", count: 2 },
    ]);
  });

  it("hides the tab row entirely when no PR has a state", () => {
    expect(prStateTabs([{ title: "a", url: "a/" }])).toEqual([]);
  });
});

describe("buildActivity", () => {
  it("merges PRs + spec revisions newest-first, capped", () => {
    const items = buildActivity(
      [{ number: 9, title: "T", url: "u/", updatedAt: "2026-07-31T08:00:00Z" }],
      [ev("2026-07-31T10:00:00Z", "updated", "anpr-entry"),
       ev("2026-07-01T00:00:00Z", "created", "old-cap")],
      2);
    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe("specification");
    expect(items[0].text).toContain("anpr entry updated");
    expect(items[1].text).toContain("#9 analyzed");
  });
});

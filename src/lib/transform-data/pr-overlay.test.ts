import { describe, expect, it } from "vitest";
import type { PROverlayData } from "@/types/analysis";
import { prOverlayToPRData } from "./pr-overlay";

// Regression: ghost candidates must be FILES, never service ids. A service
// id in this list made the canvas mark every file of that service with a
// "?" badge (one cross-service call ⇒ whole services drowned in ghosts).

const overlay = {
  title: "PR",
  baseSha: "a",
  headSha: "b",
  snapshots: [
    { fqn: "App.Caller.run", file: "src/App/Caller.cs", change: "modified" },
  ],
  edgeDeltas: [
    // Changed code calls across a service boundary into a file NOT in the PR.
    {
      fromFqn: "App.Caller.run",
      toFqn: "Domain.Rules.validate",
      toService: "IRIS.VAS.Domain",
      crossService: true,
    },
    // Same-service call — never a ghost.
    {
      fromFqn: "App.Caller.run",
      toFqn: "App.Helper.fmt",
      toService: "IRIS.VAS.Application",
      crossService: false,
    },
  ],
} as unknown as PROverlayData;

const METHODS = {
  "Domain.Rules.validate": { file: "src/Domain/Rules.cs" },
  "App.Helper.fmt": { file: "src/App/Helper.cs" },
};

describe("prOverlayToPRData ghost candidates", () => {
  it("derives ghosts at FILE granularity via the methods index", () => {
    const pr = prOverlayToPRData(overlay, METHODS);
    expect(pr?.ghostCandidates).toEqual(["src/Domain/Rules.cs"]);
  });

  it("emits NO ghosts when the target can't be resolved to a file", () => {
    const pr = prOverlayToPRData(overlay, {});
    expect(pr?.ghostCandidates).toEqual([]);
  });

  it("never emits service ids", () => {
    const pr = prOverlayToPRData(overlay, METHODS);
    expect(pr?.ghostCandidates).not.toContain("IRIS.VAS.Domain");
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { getCallers } from "./parity-loader";
import { useAnalysis } from "@/store/use-analysis-store";
import type { TransformedData } from "@/types/analysis";

/**
 * "Who calls this?" — the question the journey-scoped call graph cannot
 * answer.
 *
 * That graph is a downward tree built from the JOURNEY's edges, so a method
 * whose caller falls outside the journey slice is drawn as an entry point.
 * Observed on iris PR-685: RecordBarrierOpenAsShadowEventAsync rendered as a
 * starting method while the global map recorded DispatchActuationAsync
 * calling it. These tests pin the reverse index that fixes it.
 */
const seed = (calls: Record<string, string[]>) =>
  useAnalysis.setState({ transformedData: { calls } as unknown as TransformedData });

const DISPATCH =
  "Apcoa.IRIS.BarrierMatching.BarrierOpenDispatcher.DispatchActuationAsync(BarrierActuationRequest, CancellationToken)";
const RECORD =
  "Apcoa.IRIS.BarrierMatching.BarrierOpenDispatcher.RecordBarrierOpenAsShadowEventAsync(BarrierActuationRequest, CancellationToken)";

describe("getCallers", () => {
  beforeEach(() => seed({}));

  it("finds the caller the journey slice leaves out", () => {
    seed({ [DISPATCH]: [RECORD] });
    expect(getCallers(RECORD)).toEqual([DISPATCH]);
  });

  it("matches regardless of argument lists on either side", () => {
    // The callee is cited with args here and queried without them; both
    // forms occur in real payloads and must resolve to the same symbol.
    seed({ [DISPATCH]: [RECORD] });
    expect(getCallers(RECORD.split("(")[0])).toEqual([DISPATCH]);
  });

  it("returns every caller, not just the first", () => {
    seed({ "Ns.A.one": ["Ns.T.go"], "Ns.B.two": ["Ns.T.go"] });
    expect(getCallers("Ns.T.go").sort()).toEqual(["Ns.A.one", "Ns.B.two"]);
  });

  it("does not repeat a caller that calls the target twice", () => {
    // Two call sites in one method body are one caller, not two.
    seed({ "Ns.A.one": ["Ns.T.go(int)", "Ns.T.go(string)"] });
    expect(getCallers("Ns.T.go")).toEqual(["Ns.A.one"]);
  });

  it("returns empty for a genuine entry point", () => {
    // Distinguishable from "callers exist elsewhere" — that difference is
    // exactly what the popup reports to the reader.
    seed({ "Ns.A.one": ["Ns.B.two"] });
    expect(getCallers("Ns.A.one")).toEqual([]);
  });

  it("is empty and does not throw with no payload loaded", () => {
    useAnalysis.setState({ transformedData: null });
    expect(getCallers(RECORD)).toEqual([]);
    expect(getCallers("")).toEqual([]);
  });

  it("rebuilds when the payload changes rather than serving a stale index", () => {
    seed({ "Ns.Old.caller": ["Ns.T.go"] });
    expect(getCallers("Ns.T.go")).toEqual(["Ns.Old.caller"]);
    seed({ "Ns.New.caller": ["Ns.T.go"] });
    expect(getCallers("Ns.T.go")).toEqual(["Ns.New.caller"]);
  });
});

// ---------------------------------------------------------------------------
// The PR-role join. Measured on iris pr-690: all 7 diagram-bearing journeys
// failed the id match, because the overview keys entries by method FQN while
// a COMPOSED journey's id is `synth-<hash>`. The verdict — including "nothing
// observable changes here" — was computed, shipped, and never displayed.
// ---------------------------------------------------------------------------
import { getJourneyRole } from "./parity-loader";

const ENTRY = "Apcoa.IRIS.SkiData.SkiDataController.Permission(RequestDto, CancellationToken)";

const seedOverview = (journeys: unknown[]) =>
  useAnalysis.setState({
    transformedData: { prOverview: { journeys } } as unknown as TransformedData,
  });

describe("getJourneyRole", () => {
  it("finds a composed journey's verdict by entry FQN", () => {
    seedOverview([{ id: ENTRY, role: "ripple", whatChanged: "Nothing observable changes here." }]);
    // `synth-<hash>` is what a composed journey carries as its id.
    const r = getJourneyRole("synth-0f4e88a4eecd", ENTRY);
    expect(r?.role).toBe("ripple");
    expect(r?.whatChanged).toBe("Nothing observable changes here.");
  });

  it("still matches on journey id when the overview keys it that way", () => {
    seedOverview([{ id: ENTRY, role: "core" }]);
    expect(getJourneyRole(ENTRY)?.role).toBe("core");
  });

  it("prefers the id match over the entry-FQN match", () => {
    seedOverview([
      { id: "j1", role: "core" },
      { id: ENTRY, role: "ripple" },
    ]);
    expect(getJourneyRole("j1", ENTRY)?.role).toBe("core");
  });

  it("returns null rather than guessing when neither matches", () => {
    seedOverview([{ id: "someone-else", role: "core" }]);
    expect(getJourneyRole("synth-abc", ENTRY)).toBeNull();
  });

  it("is null with no overview at all", () => {
    useAnalysis.setState({ transformedData: null });
    expect(getJourneyRole("synth-abc", ENTRY)).toBeNull();
  });
});

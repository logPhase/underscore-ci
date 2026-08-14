import { describe, expect, it } from "vitest";
import { splitPrimary } from "./BpmnStepFunctions";
import type { BpmnElement } from "@/components/bpmn/types";

/**
 * The promotion rule, and — more importantly — its refusals.
 *
 * Reports already published carry pre-v5 diagrams with no `primary_fqn`,
 * and they must keep rendering. A wrong "this is THE function" is worse
 * than the honest flat list it replaced, so every ambiguous case falls
 * back rather than guessing.
 */
const el = (over: Partial<BpmnElement> = {}): BpmnElement => ({
  id: "t1",
  type: "service-task",
  label: "Check if plate was recently served",
  ...over,
});

const refs = (...fqns: string[]) => fqns.map(fqn => ({ fqn }));

describe("splitPrimary", () => {
  it("promotes the function the agent named", () => {
    const fns = refs(
      "Iris.BarrierMatcher.OnAnprReceivedAsync",
      "Iris.ServedOccupancyRepository.WasPlateRecentlyServedAsync",
    );
    const { primary, rest } = splitPrimary(
      el({ primary_fqn: "Iris.ServedOccupancyRepository.WasPlateRecentlyServedAsync" }),
      fns,
    );
    expect(primary?.fqn).toBe("Iris.ServedOccupancyRepository.WasPlateRecentlyServedAsync");
    expect(rest.map(r => r.fqn)).toEqual(["Iris.BarrierMatcher.OnAnprReceivedAsync"]);
  });

  it("matches the primary ignoring argument lists", () => {
    // The agent round-trips signatures inconsistently; `M(Guid)` and `M`
    // are the same symbol and must still promote.
    const fns = refs("Ns.Caller.Go(string)", "Ns.Repo.Check(Guid, bool)");
    const { primary } = splitPrimary(el({ primary_fqn: "Ns.Repo.Check" }), fns);
    expect(primary?.fqn).toBe("Ns.Repo.Check(Guid, bool)");
  });

  it("treats a lone citation as the primary without the agent saying so", () => {
    const { primary, rest } = splitPrimary(el(), refs("Ns.Repo.Check"));
    expect(primary?.fqn).toBe("Ns.Repo.Check");
    expect(rest).toEqual([]);
  });

  it("does not promote anything on a pre-v5 diagram", () => {
    const fns = refs("Ns.Caller.Go", "Ns.Repo.Check", "Ns.Ports.IRepo.Check");
    const { primary, rest } = splitPrimary(el(), fns);
    expect(primary).toBeNull();
    expect(rest).toHaveLength(3); // the honest flat list, unchanged
  });

  it("does not promote when the named primary is not among the citations", () => {
    // Rather than silently pick a neighbour: if the contract was broken,
    // show the candidates and let the reader judge.
    const fns = refs("Ns.Caller.Go", "Ns.Repo.Check");
    const { primary, rest } = splitPrimary(
      el({ primary_fqn: "Ns.Somewhere.Else" }),
      fns,
    );
    expect(primary).toBeNull();
    expect(rest).toHaveLength(2);
  });

  it("keeps the supporting cast in the order it was given", () => {
    // Callers pre-sort by PR status; promotion must not reshuffle the rest.
    const fns = refs("a.A.one", "b.B.two", "c.C.three", "d.D.four");
    const { rest } = splitPrimary(el({ primary_fqn: "c.C.three" }), fns);
    expect(rest.map(r => r.fqn)).toEqual(["a.A.one", "b.B.two", "d.D.four"]);
  });

  it("handles an element citing nothing", () => {
    const { primary, rest } = splitPrimary(el({ type: "start-event" }), []);
    expect(primary).toBeNull();
    expect(rest).toEqual([]);
  });
});

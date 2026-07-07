import { describe, expect, it } from "vitest";
import {
  buildArglessIndex,
  deriveRoots,
  deriveTreeParents,
  findReplacement,
  normalizeEdges,
  resolveFqns,
} from "./forest";

const E = (pairs: [string, string][]) =>
  pairs.map(([from, to]) => ({ from, to }));

describe("deriveRoots — full coverage, phantom entry demoted", () => {
  it("reproduces PR-589: an entryFqn with no edges must not shadow the graph", () => {
    // functions order puts the phantom entry first (deriveChapterFunctions does)
    const functions = ["Phantom.Entry", "A.Handle", "B.Handle"];
    const edges = E([
      ["A.Handle", "A.Pub"],
      ["A.Pub", "A.Kafka"],
      ["B.Handle", "B.Pub"],
    ]);
    const roots = deriveRoots(functions, edges);
    // Connected roots first; the isolated phantom LAST — it can never again
    // become the only rendered node.
    expect(roots.slice(0, 2)).toEqual(["A.Handle", "B.Handle"]);
    expect(roots[roots.length - 1]).toBe("Phantom.Entry");
  });

  it("covers cycles with no parentless member", () => {
    const roots = deriveRoots(
      ["X", "Y"],
      E([
        ["X", "Y"],
        ["Y", "X"],
      ])
    );
    expect(roots).toHaveLength(1);
  });

  it("tree parents cover every component (expandPath works across roots)", () => {
    const functions = ["Phantom", "A", "D"];
    const edges = E([
      ["A", "B"],
      ["B", "C"],
      ["D", "E"],
    ]);
    const parents = deriveTreeParents(functions, edges);
    expect(parents.get("C")).toBe("B");
    expect(parents.get("E")).toBe("D");
  });
});

describe("argless FQN resolution (BPMN code_fqns → calls keys)", () => {
  it("resolves an argless fqn to its parameterized calls key", () => {
    const calls = {
      "Ns.Cls.Do(string, int)": ["Ns.Other.Go()"],
    };
    const idx = buildArglessIndex(Object.keys(calls));
    expect(resolveFqns("Ns.Cls.Do", (k) => k in calls, idx)).toEqual([
      "Ns.Cls.Do(string, int)",
    ]);
    // exact keys pass through untouched
    expect(
      resolveFqns("Ns.Cls.Do(string, int)", (k) => k in calls, idx)
    ).toEqual(["Ns.Cls.Do(string, int)"]);
  });
});

describe("findReplacement — deleted methods point at their successor", () => {
  const steps = [
    { fqn: "Ns.NewPublisher.PublishAsync(Evt)", prStatus: "added" },
    { fqn: "Ns.Unrelated.Added(Evt)", prStatus: "added" },
    { fqn: "Ns.Old.Something(Evt)", prStatus: "modified" },
  ];
  it("matches a unique same-name added step", () => {
    expect(findReplacement("Ns.OldPublisher.PublishAsync(Evt)", steps)).toBe(
      "Ns.NewPublisher.PublishAsync(Evt)"
    );
  });
  it("returns null when nothing matches (honest note, not silence)", () => {
    expect(findReplacement("Ns.Gone.Forever(Evt)", steps)).toBeNull();
  });
  it("prefers same class when several share the name", () => {
    const amb = [
      { fqn: "A.Pub.Send(x)", prStatus: "added" },
      { fqn: "B.Pub2.Send(x)", prStatus: "added" },
    ];
    expect(findReplacement("A.Pub.Send(y)", amb)).toBe("A.Pub.Send(x)");
  });

  it("exact oldFqn lineage WINS over a same-name heuristic candidate", () => {
    // Heuristic would pick the same-name added step; the backend lineage
    // says the true successor is a differently-named method.
    const stepsWithDecoy = [
      { fqn: "Ns.Decoy.PublishAsync(Evt)", prStatus: "added" },
      { fqn: "Ns.New.EmitStateAsync(Evt)", prStatus: "added" },
    ];
    const snapshots = [
      {
        fqn: "Ns.New.EmitStateAsync(Evt)",
        oldFqn: "Ns.OldPublisher.PublishAsync(Evt)",
      },
    ];
    expect(
      findReplacement(
        "Ns.OldPublisher.PublishAsync(Evt)",
        stepsWithDecoy,
        null,
        snapshots
      )
    ).toBe("Ns.New.EmitStateAsync(Evt)");
    // arg-tolerant both ways: argless deleted fqn still matches lineage
    expect(
      findReplacement(
        "Ns.OldPublisher.PublishAsync",
        stepsWithDecoy,
        null,
        snapshots
      )
    ).toBe("Ns.New.EmitStateAsync(Evt)");
  });

  it("absent oldFqn (old payloads) falls back to the heuristic", () => {
    const snapshots = [{ fqn: "Ns.New.EmitStateAsync(Evt)" }]; // no oldFqn
    expect(
      findReplacement(
        "Ns.OldPublisher.PublishAsync(Evt)",
        steps,
        null,
        snapshots
      )
    ).toBe("Ns.NewPublisher.PublishAsync(Evt)");
  });
});

describe("normalizeEdges", () => {
  it("accepts tuples and objects", () => {
    expect(
      normalizeEdges([["a", "b"], { from: "c", to: "d" }, null as unknown])
    ).toEqual([
      { from: "a", to: "b" },
      { from: "c", to: "d" },
    ]);
  });
});

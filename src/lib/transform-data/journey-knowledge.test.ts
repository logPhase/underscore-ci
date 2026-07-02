import type { BpmnElement } from "@/components/bpmn/types";
import type { Doc, Fact } from "@/types/intent";
import { knowledgeByElement, type StepKnowledge } from "./journey-knowledge";

const doc = (title: string): Doc => ({
  title,
  snippet: `quoted passage for ${title}`,
  cite: `https://confluence/${title}`,
  score: 0.9,
});
const fact = (text: string): Fact => ({
  fact: text,
  valid_at: "2026-01-01T00:00:00Z",
  invalid_at: null,
});
const entry = (label: string): StepKnowledge => ({
  docs: [doc(label)],
  facts: [fact(label)],
});

it("leaf-matches a step entry to the element citing that code (by Class.Method)", () => {
  const elements: BpmnElement[] = [
    {
      id: "e1",
      type: "service-task",
      label: "guard",
      code_fqns: ["Apcoa.IRIS.Guards.EntryManagedByVas(Session)"],
    },
    {
      id: "e2",
      type: "service-task",
      label: "cache",
      code_evidence: [
        { fqn: "Apcoa.IRIS.ParkingSessionCacheStore.GetActiveAsync()" },
      ] as BpmnElement["code_evidence"],
    },
    {
      id: "e3",
      type: "service-task",
      label: "unrelated",
      code_fqns: ["Ns.Other.Foo()"],
    },
  ];
  const journeySteps: Record<string, StepKnowledge> = {
    "Apcoa.IRIS.Guards.EntryManagedByVas(Session)": entry("Entry-guard"),
    "Apcoa.IRIS.ParkingSessionCacheStore.GetActiveAsync()": entry("Cache"),
  };
  const map = knowledgeByElement(elements, journeySteps);
  expect([...map.keys()].sort()).toEqual(["e1", "e2"]); // e3 untouched
  expect(map.get("e1")!.docs.map((d) => d.title)).toEqual(["Entry-guard"]);
  expect(map.get("e2")!.facts.map((f) => f.fact)).toEqual(["Cache"]);
});

it("matches interface-prefixed citations to the impl step (IFoo.Bar ~ Foo.Bar)", () => {
  const elements: BpmnElement[] = [
    {
      id: "e1",
      type: "service-task",
      label: "x",
      code_fqns: ["Ns.IEntryGuard.Check()"],
    },
  ];
  const journeySteps: Record<string, StepKnowledge> = {
    // step FQN keyed on the concrete impl, no args; citation has the I-prefix + args
    "Ns.EntryGuard.Check": entry("guard-knowledge"),
  };
  const map = knowledgeByElement(elements, journeySteps);
  expect(map.has("e1")).toBe(true);
  expect(map.get("e1")!.docs.map((d) => d.title)).toEqual(["guard-knowledge"]);
});

it("absent step FQN yields no entry (honest no-context)", () => {
  const elements: BpmnElement[] = [
    { id: "e1", type: "service-task", label: "x", code_fqns: ["Ns.A.B()"] },
  ];
  // A different step's FQN — the element's cited code has no matching step.
  const journeySteps: Record<string, StepKnowledge> = {
    "Ns.C.D": entry("other"),
  };
  expect(knowledgeByElement(elements, journeySteps).size).toBe(0);
});

it("elements with no cited code are absent from the map", () => {
  const elements: BpmnElement[] = [
    { id: "e1", type: "service-task", label: "no-code" },
  ];
  const journeySteps: Record<string, StepKnowledge> = {
    "Ns.A.B": entry("a"),
  };
  expect(knowledgeByElement(elements, journeySteps).size).toBe(0);
});

it("normalizes a legacy step entry that omits facts (no crash reading .length)", () => {
  const elements: BpmnElement[] = [
    { id: "e1", type: "service-task", label: "x", code_fqns: ["Ns.A.B()"] },
  ];
  // Wire payload shape — docs only, no `facts` key.
  const legacy = { docs: [doc("d")] } as unknown as StepKnowledge;
  const journeySteps: Record<string, StepKnowledge> = { "Ns.A.B": legacy };
  const got = knowledgeByElement(elements, journeySteps).get("e1")!;
  expect(got.facts).toEqual([]);
  expect(got.docs).toHaveLength(1);
  // the exact crash repro: reading .length on both must be safe
  expect(got.docs.length + got.facts.length).toBe(1);
});

it("passes the synthesized knowledge summary through to the element", () => {
  const elements: BpmnElement[] = [
    { id: "e1", type: "service-task", label: "x", code_fqns: ["Ns.A.B()"] },
  ];
  const journeySteps: Record<string, StepKnowledge> = {
    "Ns.A.B": {
      knowledge: { summary: "clean synthesized prose", cites: ["c1"] },
      docs: [],
      facts: [],
    },
  };
  expect(knowledgeByElement(elements, journeySteps).get("e1")!.knowledge?.summary).toBe(
    "clean synthesized prose",
  );
});

import type { BpmnElement } from "@/components/bpmn/types";
import type { Doc, Fact, KnowledgeSummary } from "@/types/intent";

/** `Foo.bar(args)` → `Foo.bar`; interface-prefix tolerant so a citation on
 *  `IFoo.bar` matches a grounding symbol on the impl `Foo.bar` (same
 *  convention FunctionBodyPanel uses to link BPMN steps to methods). */
function classMethod(fqn: string): string {
  const noArgs = (fqn || "").replace(/\(.*$/, "").trim();
  const parts = noArgs.split(".");
  const method = parts.pop() ?? "";
  const cls = (parts.pop() ?? "").replace(/^I(?=[A-Z])/, "");
  return `${cls}.${method}`;
}

/** One step's surfaced context: the synthesized summary (headline) +
 *  Confluence passages + graph facts. */
export type StepKnowledge = {
  knowledge?: KnowledgeSummary;
  docs: Doc[];
  facts: Fact[];
};

/** The `Class.Method` set a BPMN element cites — interface-prefix tolerant
 *  via `classMethod`. */
function citedCode(el: BpmnElement): Set<string> {
  const fqns = [
    ...(el.code_fqns ?? []),
    ...((el.code_evidence ?? [])
      .map((e) => e?.fqn)
      .filter(Boolean) as string[]),
  ];
  return new Set(fqns.map(classMethod));
}

/**
 * Map each BPMN element id → the journey-step knowledge (docs + facts) for the
 * step whose code it cites. `journeySteps` is keyed by step FQN; we compare on
 * `Class.Method` (via `classMethod`) so a citation on `IFoo.Bar(args)` matches
 * a step keyed `Ns.Foo.Bar`.
 *
 * This is a direct keyed leaf-match lookup — no grounding/symbol logic. An
 * element matches a step when any of its cited code (`code_fqns` /
 * `code_evidence[].fqn`) shares the same `Class.Method` as a step FQN key.
 * Elements with no cited code, or whose cited code matches no step, are absent
 * from the result map (honest no-context).
 */
export function knowledgeByElement(
  elements: BpmnElement[] | undefined,
  journeySteps: Record<string, StepKnowledge> | undefined
): Map<string, StepKnowledge> {
  const out = new Map<string, StepKnowledge>();
  if (!elements?.length || !journeySteps) return out;

  // Index the step entries by Class.Method for O(1) leaf-match lookup.
  const byLeaf = new Map<string, StepKnowledge>();
  for (const [stepFqn, entry] of Object.entries(journeySteps)) {
    byLeaf.set(classMethod(stepFqn), entry);
  }
  if (byLeaf.size === 0) return out;

  for (const el of elements) {
    const cited = citedCode(el);
    if (cited.size === 0) continue;
    for (const leaf of cited) {
      const entry = byLeaf.get(leaf);
      if (entry) {
        // Normalize: any of the arrays may be absent in the wire payload, but
        // the upstream `as` cast hides that from the type-checker. Guarantee
        // both arrays so downstream can read `.length` / map without crashing.
        out.set(el.id, {
          knowledge: entry.knowledge,
          docs: entry.docs ?? [],
          facts: entry.facts ?? [],
        });
        break;
      }
    }
  }
  return out;
}

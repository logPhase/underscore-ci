// Pure helpers for the § spec markers + popup — the living-spec verdicts the
// analyzer attaches to PR-changed diagram elements (BpmnElement.spec_refs).
// Kept out of the components so the marker/popup data mapping is unit-testable.

import type { SpecsPayload } from "@/types/specs";
import type { BpmnElement, BpmnSpecRef } from "./types";

/** Marker state for an element's § badge. null = no badge. `conflict` picks
 *  the rose (any verdict "conflicts") vs quiet cyan treatment. */
export function specMarkerState(
  el: Pick<BpmnElement, "spec_refs">,
): { count: number; conflict: boolean } | null {
  const refs = el.spec_refs ?? [];
  if (refs.length === 0) return null;
  return {
    count: refs.length,
    conflict: refs.some((r) => r.verdict === "conflicts"),
  };
}

/** Resolve a ref to the full spec text baked into THIS report's specs
 *  payload. A sibling repo's spec is not baked into this report, so it
 *  resolves to `{content: null, sibling: true}` — the popup then leans on
 *  the analyzer-verified requirement quote alone. A ref with no `repo` is
 *  treated as this repo's (the analyzer only omits it when unambiguous). */
export function resolveSpecContent(
  ref: BpmnSpecRef,
  specs: SpecsPayload | null | undefined,
): { content: string | null; sibling: boolean } {
  const own = !ref.repo || (specs ? ref.repo === specs.repo_id : false);
  if (!own) return { content: null, sibling: true };
  const entry = specs?.specs.find((s) => s.capability === ref.capability);
  return { content: entry?.content ?? null, sibling: false };
}

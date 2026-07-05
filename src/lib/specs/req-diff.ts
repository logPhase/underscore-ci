import { splitSpecBlocks } from "./ears";

export type ReqChange = "new" | "changed";

/** Word-set Jaccard similarity — cheap "is this the same requirement,
 *  reworded?" signal. 0.5 splits reworded (shares most words) from new. */
const SIMILAR = 0.5;

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/\W+/).filter(Boolean));
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

function requirementTexts(content: string | null): string[] {
  if (!content) return [];
  return splitSpecBlocks(content)
    .filter((b) => b.kind === "req")
    .map((b) => b.text);
}

/** Which requirements of the current spec were touched by its latest
 *  revision: reqNo → "changed" (a similar requirement existed before,
 *  reworded) or "new" (nothing like it in the previous version). Drives
 *  the margin change bars. */
export function touchedRequirements(
  previousContent: string | null,
  currentContent: string
): Map<number, ReqChange> {
  const previous = requirementTexts(previousContent).map(words);
  const previousExact = new Set(requirementTexts(previousContent));
  const touched = new Map<number, ReqChange>();

  requirementTexts(currentContent).forEach((text, i) => {
    if (previousExact.has(text)) return;
    const w = words(text);
    const closest = previous.reduce(
      (best, p) => Math.max(best, similarity(w, p)),
      0
    );
    touched.set(i + 1, closest >= SIMILAR ? "changed" : "new");
  });
  return touched;
}

/** Previous requirements that no current requirement resembles — shown as
 *  a "N removed" note pointing at the full diff. */
export function removedRequirementCount(
  previousContent: string | null,
  currentContent: string
): number {
  const current = requirementTexts(currentContent);
  const currentExact = new Set(current);
  const currentWords = current.map(words);

  return requirementTexts(previousContent).filter((text) => {
    if (currentExact.has(text)) return false;
    const w = words(text);
    return !currentWords.some((c) => similarity(w, c) >= SIMILAR);
  }).length;
}

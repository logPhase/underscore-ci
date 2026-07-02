import { Chapter } from "@/types/journey";

/**
 * Return a chapter as it would look if the analyzer had been run on HEAD alone.
 * - Steps with prStatus "deleted" or "disconnected" (not present / no longer
 *   called in HEAD) are dropped from steps, functions, and edges.
 * - prStatus and beforeBody are stripped from the remaining steps.
 * - Chapter-level prStatus is cleared.
 */
export function stripPRFromChapter(chapter: Chapter): Chapter {
  const absentInHead = new Set(
    chapter.steps
      .filter((s) => s.prStatus === "deleted" || s.prStatus === "disconnected")
      .map((s) => s.fqn)
  );

  const steps = chapter.steps
    .filter((s) => !absentInHead.has(s.fqn))
    .map((s) => {
      const { prStatus: _prStatus, beforeBody: _beforeBody, ...rest } = s;
      void _prStatus;
      void _beforeBody;
      return rest;
    });

  const functions = chapter.functions.filter((f) => !absentInHead.has(f));
  const edges = chapter.edges.filter(
    (e) => !absentInHead.has(e.from) && !absentInHead.has(e.to)
  );

  const { prStatus: _chapterPRStatus, ...chapterRest } = chapter;
  void _chapterPRStatus;
  return { ...chapterRest, steps, functions, edges };
}

import { JOURNEY_COLORS } from "@/data/journeys";
import {
  Chapter,
  ChapterPRStatus,
  ChapterStep,
  RawFile,
  RawJourney,
  RawMethod,
  RawStep,
  StepPRStatus,
} from "@/types/journey";
import {
  classFqnFromFqn,
  classNameOf,
  shortHash,
  shortNameFromFqn,
  slugifyTitle,
} from "./utils";
import {
  JourneyData,
  JourneyPhaseData,
  JourneyStepData,
} from "@/store/use-journey-store";
import { clampCriticality, clampStatus } from "./sanitize";
import { deriveChapterFunctions, deriveChapterServices } from "./derive-data";
import { synthBpmnFromTrace } from "./synth-bpmn";
import type { BpmnJourney } from "@/components/bpmn/types";

/** Hydrate a chapter step by resolving FQN against the methods registry,
 *  carrying the step's own per-step PR fields through. Per-step PR state
 *  is journey-contextual (the same FQN can be deleted in one journey and
 *  added in another), so it lives on the step record, not in a global map.
 *
 *  When `methods[fqn]` is missing (rare — e.g. a corrupt fixture), we still
 *  render the step with name/class derived from the FQN string, rather than
 *  dropping it. */
function hydrateChapterStep(
  raw: RawStep,
  methods: Record<string, RawMethod>
): ChapterStep {
  const m = methods[raw.fqn];
  const classFqn = m?.classFqn || classFqnFromFqn(raw.fqn);
  const step: ChapterStep = {
    fqn: raw.fqn,
    name: m?.name || shortNameFromFqn(raw.fqn),
    class: classNameOf(classFqn),
    file: m?.file || "",
  };
  if (typeof m?.body === "string") step.body = m.body;
  if (m?.kind === "interface" || m?.kind === "abstract") step.kind = m.kind;
  if (raw.prStatus) step.prStatus = raw.prStatus as StepPRStatus;
  if (typeof raw.beforeBody === "string") step.beforeBody = raw.beforeBody;
  // Per-step findings emitted by the multi-agent reviewer. Optional —
  // present only when --review ran AND the reviewer attached findings to
  // this specific step.
  if (Array.isArray(raw.findings) && raw.findings.length > 0) {
    step.findings = raw.findings as ChapterStep["findings"];
  }
  return step;
}

/**
 * Build the chapter store from the new on-disk shape.
 *
 * Each journey in raw shape carries only FQN references in steps[]. We
 * resolve those against the global methods registry to produce fully-
 * hydrated ChapterStep records. Per-step PR data comes from the sparse
 * prChanges map. chapter.functions, .services, and .phaseCount are
 * derived at load time.
 */
export function transformChapters(
  rawJourneys: RawJourney[],
  methods: Record<string, RawMethod>,
  files: Record<string, RawFile>,
  calls: Record<string, string[]> = {}
) {
  const chapters = (rawJourneys || []).map((j, idx): Chapter => {
    const id = j.id || `chapter-${idx}`;
    let edgesRaw = j.edges || [];
    let rawSteps = j.steps || [];
    // Composed (synth-…) journeys ship the BPMN diagram but NO steps/edges:
    // the analyzer's /bpmn "replace raw with composed" path carries only the
    // diagram, dropping the desktop trace's call graph. Rebuild it from the
    // diagram's `code_fqns` + the global call graph (intact in `calls`) so the
    // call-graph view + step list still render. Fallback only — real
    // backend-emitted edges always win.
    if (edgesRaw.length === 0) {
      const els = (j.bpmn as BpmnJourney | undefined)?.elements ?? [];
      const fqns = new Set<string>();
      for (const el of els)
        for (const f of (el as { code_fqns?: string[] }).code_fqns ?? [])
          fqns.add(f);
      if (fqns.size > 0) {
        const derived: [string, string][] = [];
        for (const f of fqns)
          for (const c of calls[f] ?? []) derived.push([f, c]);
        if (derived.length > 0) edgesRaw = derived;
        if (rawSteps.length === 0) rawSteps = [...fqns].map((f) => ({ fqn: f }));
      }
    }
    const edges = edgesRaw.map(([from, to]) => ({ from, to }));
    const phases = (j.phases || []).map((p) => ({
      name: p.name || "",
      narrative: p.narrative || "",
      fqns: [...(p.fqns || [])],
    }));

    const functions = deriveChapterFunctions(edgesRaw, j.entryFqn);
    const services = deriveChapterServices(rawSteps, methods, files);

    const chapterSteps: ChapterStep[] = rawSteps.map((s) =>
      hydrateChapterStep(s, methods)
    );

    // Trust the backend-emitted prStatus — it carries the PR pipeline's
    // full classification (added / removed / affected / demoted).
    const rawPrStatus = j.prStatus;
    const chapterPrStatus: ChapterPRStatus | undefined =
      rawPrStatus === "added" ||
      rawPrStatus === "removed" ||
      rawPrStatus === "affected" ||
      rawPrStatus === "demoted"
        ? rawPrStatus
        : undefined;

    // AI-generated narrative for the journey. Optional on the wire — empty
    // string when narratives are skipped (default in PR mode without
    // --with-narratives). Read from either kebab-case or camelCase to
    // tolerate both backend variants.
    const globalNarrative =
      ((j as unknown as Record<string, unknown>)["global-narrative"] as string) ||
      ((j as unknown as Record<string, unknown>).globalNarrative as string) ||
      "";

    // Prefer the agent's business-meaningful BPMN title over the raw entry
    // method name. "ProcessMessageAsync" is useless to a non-engineer;
    // "Route and process incoming VAS Kafka message" is the actual flow.
    // Falls back to the journey title (entry FQN basename) when no BPMN
    // diagram has been produced for this journey yet.
    const bpmnTitle = (j.bpmn as { title?: string } | undefined)?.title;
    const rawTitle = j.title || "Untitled Chapter";
    const displayTitle =
      bpmnTitle && bpmnTitle.trim().length > 0 ? bpmnTitle : rawTitle;
    // When we replaced title with the BPMN title, surface the raw entry
    // method name in the summary so the original method-name lookup
    // (search, debugging) still works.
    const summary =
      j.summary ||
      (bpmnTitle
        ? `${rawTitle} — ${globalNarrative.slice(0, 100)}`
        : globalNarrative.slice(0, 120)) ||
      (phases[0]?.narrative || "").slice(0, 120);

    // BPMN diagram: prefer the AI Business-Flow diagram, but fall back to a
    // deterministic flow synthesized from the call trace (steps + edges) when
    // the AI diagram is missing or empty — e.g. the analyzer /bpmn call timed
    // out and journeys shipped diagram-less. Guarantees every call graph
    // renders a diagram with no LLM and no re-run.
    // AI diagram passes through verbatim and never carries `synthetic`; the
    // synth fallback always does (set in synthBpmnFromTrace). That flag is
    // how the journey view tells the honest AI flow from the raw call trace.
    const aiBpmn = j.bpmn as BpmnJourney | undefined;
    const hasAiBpmn = !!(
      aiBpmn &&
      Array.isArray(aiBpmn.elements) &&
      aiBpmn.elements.length > 0
    );
    const bpmn: (BpmnJourney & { synthetic?: boolean }) | undefined = hasAiBpmn
      ? aiBpmn
      : chapterSteps.length > 0 || edges.length > 0
        ? synthBpmnFromTrace({
            journeyId: id,
            title: displayTitle,
            entryFqn: j.entryFqn || "",
            steps: chapterSteps,
            edges,
          })
        : undefined;

    return {
      id,
      slug: "",
      title: displayTitle,
      summary,
      criticality: clampCriticality(j.criticality),
      services,
      functions,
      edges,
      steps: chapterSteps,
      phaseCount: phases.length,
      phases,
      status: clampStatus(j.status),
      ...(chapterPrStatus ? { prStatus: chapterPrStatus } : {}),
      ...(j.reviewSummary
        ? { reviewSummary: j.reviewSummary as Chapter["reviewSummary"] }
        : {}),
      // BPMN diagram — AI Business-Flow diagram when present, else the
      // deterministic call-trace fallback computed above.
      ...(bpmn ? { bpmn: bpmn as Chapter["bpmn"] } : {}),
      ...(j.bpmnValidation
        ? { bpmnValidation: j.bpmnValidation as Chapter["bpmnValidation"] }
        : {}),
      globalNarrative,
      flowchart: (j.flowchart as string) || "",
      entryFqn: j.entryFqn || "",
      handlerType: (j.handlerType as Chapter["handlerType"]) || "command",
      color: JOURNEY_COLORS[idx % JOURNEY_COLORS.length],
      // Intent classification fields (added by underscore-cli.intent-classifier).
      // All optional — absent when the classifier didn't run or the journey
      // wasn't PR-affected.
      ...((j as unknown as Record<string, unknown>).intentCategory
        ? {
            intentCategory: (j as unknown as Record<string, unknown>)
              .intentCategory as Chapter["intentCategory"],
          }
        : {}),
      ...((j as unknown as Record<string, unknown>).intentReclass
        ? {
            intentReclass: (j as unknown as Record<string, unknown>)
              .intentReclass as Chapter["intentReclass"],
          }
        : {}),
      ...((j as unknown as Record<string, unknown>).intentReclassFreeform
        ? {
            intentReclassFreeform: (j as unknown as Record<string, unknown>)
              .intentReclassFreeform as string,
          }
        : {}),
      ...((j as unknown as Record<string, unknown>).intentWhy
        ? { intentWhy: (j as unknown as Record<string, unknown>).intentWhy as string }
        : {}),
    };
  });

  // Assign URL slugs: readable title (or short method name when the title
  // is the default placeholder) + 6-hex hash of entryFqn. The hash is a pure
  // function of the journey's identity, so a slug for any given journey stays
  // stable across runs even if other journeys are added, removed, or reordered.
  for (const chapter of chapters) {
    const seed = chapter.entryFqn || chapter.id;
    const tag = shortHash(seed);
    const titleIsDefault =
      !chapter.title || chapter.title === "Untitled Chapter";
    const readable = titleIsDefault
      ? slugifyTitle(shortNameFromFqn(chapter.entryFqn))
      : slugifyTitle(chapter.title);
    chapter.slug = `${readable}-${tag}`;
  }

  // Build _chapterById and _chapterBySlug indexes
  const chapterById: Map<string, Chapter> = new Map();
  const chapterBySlug: Map<string, Chapter> = new Map();
  for (const chapter of chapters) {
    chapterById.set(chapter.id, chapter);
    chapterBySlug.set(chapter.slug, chapter);
  }

  // Build _functionToChapters index (FQN → chapter IDs)
  const functionToChapters = new Map();
  for (const chapter of chapters) {
    for (const fqn of chapter.functions) {
      const existing = functionToChapters.get(fqn) || [];
      if (!existing.includes(chapter.id)) {
        functionToChapters.set(fqn, [...existing, chapter.id]);
      }
    }
  }

  console.info(
    `[dataLoader] Indexed ${chapters.length} chapters ` +
      `(${chapterById.size} by ID, ${functionToChapters.size} FQN cross-refs)`
  );

  return { chapters, chapterById, chapterBySlug, functionToChapters };
}

export function transformJourneys(
  rawJourneys: RawJourney[],
  methods: Record<string, RawMethod>,
  files: Record<string, RawFile>
) {
  const journeys = (rawJourneys || []).map((j, idx): JourneyData => {
    const rawSteps = j.steps || [];
    const phases: JourneyPhaseData[] = (j.phases || []).map((p) => ({
      name: p.name || "",
      narrative: p.narrative || "",
      fqns: [...(p.fqns || [])],
    }));
    // Build phaseIdx lookup: fqn -> first phase that contains it
    const fqnToPhaseIdx = new Map<string, number>();
    phases.forEach((p, pi) => {
      for (const fqn of p.fqns)
        if (!fqnToPhaseIdx.has(fqn)) fqnToPhaseIdx.set(fqn, pi);
    });

    const steps: JourneyStepData[] = rawSteps.map((s) => {
      const m = methods[s.fqn];
      const file = m?.file || "";
      const service = file ? files[file]?.service || "" : "";
      return {
        fqn: s.fqn,
        name: m?.name || "",
        class: classNameOf(m?.classFqn || ""),
        service,
        file,
        phaseIdx: fqnToPhaseIdx.get(s.fqn) ?? 0,
      };
    });

    return {
      id: j.id || `journey-${idx}`,
      title: j.title || "Untitled Journey",
      color: JOURNEY_COLORS[idx % JOURNEY_COLORS.length],
      entryFqn: j.entryFqn || "",
      handlerType: (j.handlerType as JourneyData["handlerType"]) || "command",
      phases,
      steps,
      edges: (j.edges || []).map(([a, b]) => [a, b] as [string, string]),
      // Narrative/PR carry-through — keeps the canvas JourneyData path from
      // dropping the fields the journey UI reads off chapters.
      ...(j.summary !== undefined && { summary: j.summary }),
      ...(j.criticality !== undefined && { criticality: j.criticality }),
      ...(j.status !== undefined && { status: j.status }),
      ...(j.prStatus !== undefined && { prStatus: j.prStatus }),
      hasBpmn: j.bpmn != null,
    };
  });

  const journeyByFqn: Map<string, JourneyData[]> = new Map();
  const journeyByEntry: Map<string, JourneyData> = new Map();

  for (const journey of journeys) {
    journeyByEntry.set(journey.entryFqn, journey);
    const existing = journeyByFqn.get(journey.entryFqn) || [];
    journeyByFqn.set(journey.entryFqn, [...existing, journey]);
    for (const step of journey.steps) {
      const list = journeyByFqn.get(step.fqn) || [];
      if (!list.includes(journey))
        journeyByFqn.set(step.fqn, [...list, journey]);
    }
    for (const phase of journey.phases) {
      for (const fqn of phase.fqns) {
        const list = journeyByFqn.get(fqn) || [];
        if (!list.includes(journey)) journeyByFqn.set(fqn, [...list, journey]);
      }
    }
  }
  console.info(
    `[dataLoader] Indexed ${journeys.length} journeys (${journeyByFqn.size} FQN entries)`
  );
  return { journeys, journeyByFqn, journeyByEntry };
}

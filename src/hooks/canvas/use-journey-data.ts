import { useAnalysis } from "@/store/use-analysis-store";
import { useJourneyStore } from "@/store/use-journey-store";
import type { JourneyData } from "@/store/use-journey-store";
import { useMemo } from "react";

/**
 * Journey state as the canvas consumes it. Driven by the TRANSIT LINES
 * (activeLineIds — the journey-lines picker); the legacy single
 * `activeJourney` still participates so ESC/phase shortcuts keep working
 * if something re-activates it.
 */
const useJourneyData = () => {
  const activeJourney = useJourneyStore((state) => state.activeJourney);
  const activePhaseIdx = useJourneyStore((state) => state.activePhaseIdx);
  const activeLineIds = useJourneyStore((state) => state.activeLineIds);
  const journeys = useAnalysis((s) => s.transformedData?.journeys);

  /** The journeys currently lit as lines, activation order. */
  const activeLines = useMemo<JourneyData[]>(() => {
    const byId = new Map((journeys ?? []).map((j) => [j.id, j]));
    const lines = activeLineIds
      .map((id) => byId.get(id))
      .filter(Boolean) as JourneyData[];
    if (activeJourney && !lines.some((j) => j.id === activeJourney.id))
      lines.push(activeJourney);
    return lines;
  }, [journeys, activeLineIds, activeJourney]);

  const isJourneyActive = activeLines.length > 0;

  const journeyStepFqns = useMemo(() => {
    const set = new Set<string>();
    for (const j of activeLines) for (const s of j.steps) set.add(s.fqn);
    return set;
  }, [activeLines]);

  const journeyServiceIds = useMemo(() => {
    const set = new Set<string>();
    for (const j of activeLines)
      for (const s of j.steps) if (s.service) set.add(s.service);
    return set;
  }, [activeLines]);

  const activePhaseStepFqns = useMemo(() => {
    if (!activeJourney || activePhaseIdx === null) return null;
    const phase = activeJourney.phases[activePhaseIdx];
    return phase ? new Set(phase.fqns) : null;
  }, [activeJourney, activePhaseIdx]);

  return {
    isJourneyActive,
    activeLines,
    journeyStepFqns,
    journeyServiceIds,
    activePhaseStepFqns,
  };
};

export default useJourneyData;

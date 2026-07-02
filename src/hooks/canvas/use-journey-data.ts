import { useJourneyStore } from "@/store/use-journey-store";
import { useMemo } from "react";

const useJourneyData = () => {
  const activeJourney = useJourneyStore((state) => state.activeJourney);
  const activePhaseIdx = useJourneyStore((state) => state.activePhaseIdx);

  // Journey state
  const isJourneyActive = !!activeJourney;

  const journeyStepFqns = useMemo(() => {
    if (!activeJourney) return new Set<string>();
    return new Set(activeJourney.steps.map((s: { fqn: string }) => s.fqn));
  }, [activeJourney]);

  const journeyServiceIds = useMemo(() => {
    if (!activeJourney) return new Set<string>();
    return new Set(
      activeJourney.steps
        .map((s: { service: string }) => s.service)
        .filter(Boolean)
    );
  }, [activeJourney]);

  const activePhaseStepFqns = useMemo(() => {
    if (!activeJourney || activePhaseIdx === null) return null;
    const phase = activeJourney.phases[activePhaseIdx];
    return phase ? new Set(phase.fqns) : null;
  }, [activeJourney, activePhaseIdx]);

  return {
    isJourneyActive,
    journeyStepFqns,
    journeyServiceIds,
    activePhaseStepFqns,
  };
};

export default useJourneyData;

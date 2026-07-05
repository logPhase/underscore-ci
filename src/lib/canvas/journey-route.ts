import type { JourneyData } from "@/store/use-journey-store";
import type { PositionedGroupRegion } from "@/types/grouping";

// ---------------------------------------------------------------------------
// Journey → component route. The transit-line view renders a journey at the
// ARCHITECTURE level: consecutive steps inside the same component collapse
// into one stop, the line is the ordered sequence of component transitions.
// Functions/classes are deliberately absent (strategic abstraction — that
// detail lives in the chapter view). Pure and deterministic.
//
// "Component" = the journey's grouping unit: the module GROUP when the
// payload carries the grouping-agent partition, else the service itself —
// the same fallback the hull rendering uses.
// ---------------------------------------------------------------------------

/** One component the journey passes through (unique per component, in
 *  first-visit order). Positions are resolved at render time — group stops
 *  from serviceGroups[].cx/cy, service stops from the live servicePosRef. */
export interface RouteStop {
  /** Group id (kind "group") or service id (kind "service"). */
  key: string;
  kind: "group" | "service";
  name: string;
  /** 1-based first-visit order — the number on the stop badge. */
  seq: number;
  /** Total journey steps that live in this component. */
  stepCount: number;
  /** Steps here the PR touched (prStatus set) — the amber marker. */
  changedSteps: number;
  /** Member services the journey actually touches (hover detail). */
  serviceIds: string[];
  /** Up to 6 step names for the hover card. */
  stepNames: string[];
}

/** One traversal leg between two stops, in step order. Revisits produce
 *  repeat legs (A→B→A keeps both hops — direction is the story). */
export interface RouteLeg {
  from: string;
  to: string;
}

export interface JourneyRoute {
  journeyId: string;
  stops: RouteStop[];
  legs: RouteLeg[];
  /** Steps whose service could not be resolved — honest-uncertainty count. */
  unmappedSteps: number;
}

const MAX_HOVER_NAMES = 6;

/**
 * Collapse a journey's step sequence into its component route.
 *
 * `serviceGroups` present → group-level stops (service→group via serviceIds);
 * absent/empty → service-level stops named via `serviceNameById`.
 */
export function deriveJourneyRoute(
  journey: JourneyData,
  serviceGroups: PositionedGroupRegion[] | null | undefined,
  serviceNameById: Map<string, string>
): JourneyRoute {
  const groupByService = new Map<string, PositionedGroupRegion>();
  for (const g of serviceGroups ?? [])
    for (const sid of g.serviceIds) groupByService.set(sid, g);
  const grouped = groupByService.size > 0;

  const stopsByKey = new Map<string, RouteStop>();
  const legs: RouteLeg[] = [];
  let unmappedSteps = 0;
  let prevKey: string | null = null;

  for (const step of journey.steps) {
    const sid = step.service;
    if (!sid) {
      unmappedSteps++;
      continue;
    }
    const group = grouped ? groupByService.get(sid) : undefined;
    const key = group ? group.id : sid;
    const name = group
      ? group.name
      : (serviceNameById.get(sid) ?? sid);

    let stop = stopsByKey.get(key);
    if (!stop) {
      stop = {
        key,
        kind: group ? "group" : "service",
        name,
        seq: stopsByKey.size + 1,
        stepCount: 0,
        changedSteps: 0,
        serviceIds: [],
        stepNames: [],
      };
      stopsByKey.set(key, stop);
    }
    stop.stepCount++;
    if (step.prStatus) stop.changedSteps++;
    if (!stop.serviceIds.includes(sid)) stop.serviceIds.push(sid);
    if (stop.stepNames.length < MAX_HOVER_NAMES) {
      const label = step.name || step.class || step.fqn;
      if (label && !stop.stepNames.includes(label)) stop.stepNames.push(label);
    }

    if (prevKey !== null && prevKey !== key)
      legs.push({ from: prevKey, to: key });
    prevKey = key;
  }

  return {
    journeyId: journey.id,
    stops: [...stopsByKey.values()],
    legs,
    unmappedSteps,
  };
}

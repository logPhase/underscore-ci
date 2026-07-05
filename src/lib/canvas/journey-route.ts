import type { JourneyData } from "@/store/use-journey-store";
import type {
  FileComponentRef,
  PositionedGroupRegion,
} from "@/types/grouping";

// ---------------------------------------------------------------------------
// Journey → component route. The transit-line view renders a journey at the
// ARCHITECTURE level: consecutive steps inside the same component collapse
// into one stop, the line is the ordered sequence of component transitions.
// Functions/classes are deliberately absent (strategic abstraction — that
// detail lives in the chapter view). Pure and deterministic.
//
// "Component" = the journey's finest available grouping unit, chosen by which
// data the payload carries:
//   1. functional COMPONENT (fileGroups)  — a sub-service business unit
//   2. module GROUP (grouping agent)      — a cluster of services
//   3. the SERVICE itself                 — the always-present fallback
// The three modes are mutually exclusive per run; a step that can't resolve at
// the finest active level falls back to its service.
// ---------------------------------------------------------------------------

/** One component the journey passes through (unique per component, in
 *  first-visit order). Positions are resolved at render time — group stops
 *  from serviceGroups[].cx/cy, service stops from the live servicePosRef,
 *  component stops from the per-service package positions. */
export interface RouteStop {
  /** Component stop `${service}::${componentId}`, group id, or service id —
   *  matching `kind`. */
  key: string;
  kind: "group" | "service" | "component";
  name: string;
  /** 1-based first-visit order — the number on the stop badge. */
  seq: number;
  /** Total journey steps that live in this component. */
  stepCount: number;
  /** Steps here the PR touched (prStatus set) — the amber marker. */
  changedSteps: number;
  /** Member services the journey actually touches (hover detail). For a
   *  component stop this is the single owning service — `serviceIds[0]` is
   *  the service whose package positions resolve this stop's anchor. */
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
 * Stop granularity is the finest level the run supports:
 *   - `fileToComponent` present → functional-COMPONENT stops
 *     (`${service}::${componentId}`); a step whose file no component claims
 *     falls back to a service stop.
 *   - else `serviceGroups` present → module-GROUP stops (service→group).
 *   - else → SERVICE stops, named via `serviceNameById`.
 */
export function deriveJourneyRoute(
  journey: JourneyData,
  serviceGroups: PositionedGroupRegion[] | null | undefined,
  serviceNameById: Map<string, string>,
  fileToComponent?: Map<string, FileComponentRef> | null
): JourneyRoute {
  const groupByService = new Map<string, PositionedGroupRegion>();
  for (const g of serviceGroups ?? [])
    for (const sid of g.serviceIds) groupByService.set(sid, g);
  const grouped = groupByService.size > 0;
  const componentMode = !!(fileToComponent && fileToComponent.size > 0);

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

    // Resolve this step's stop identity at the finest active granularity.
    // Component mode collapses to the service when no component owns the file
    // (leftover) — it never drops to group, keeping stops inside a service.
    let key: string;
    let kind: RouteStop["kind"];
    let name: string;
    const comp = componentMode ? fileToComponent!.get(step.file) : undefined;
    if (comp && comp.service === sid) {
      key = `${sid}::${comp.componentId}`;
      kind = "component";
      name = comp.componentName;
    } else if (componentMode || !grouped) {
      key = sid;
      kind = "service";
      name = serviceNameById.get(sid) ?? sid;
    } else {
      const group = groupByService.get(sid);
      key = group ? group.id : sid;
      kind = group ? "group" : "service";
      name = group ? group.name : (serviceNameById.get(sid) ?? sid);
    }

    let stop = stopsByKey.get(key);
    if (!stop) {
      stop = {
        key,
        kind,
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

import type { SpecHistoryEvent } from "@/types/specs";

/** The immediately-preceding version of the same capability, given the
 *  newest-first history the API returns — the "before" side of a diff.
 *  null when the version is the capability's first (or unknown). */
export function previousVersionOf(
  history: SpecHistoryEvent[],
  versionId: string
): SpecHistoryEvent | null {
  const index = history.findIndex((e) => e.version_id === versionId);
  if (index === -1) return null;
  const capability = history[index].capability;
  for (let i = index + 1; i < history.length; i++) {
    if (history[i].capability === capability) return history[i];
  }
  return null;
}

/** Newest event per capability (history is newest-first, so first hit wins). */
export function latestByCapability(
  history: SpecHistoryEvent[]
): Map<string, SpecHistoryEvent> {
  const latest = new Map<string, SpecHistoryEvent>();
  for (const event of history) {
    if (!latest.has(event.capability)) latest.set(event.capability, event);
  }
  return latest;
}

/** Capabilities whose latest event is a deletion and that have no living
 *  spec — the "removed on X, here's what it said" section. */
export function removedCapabilities(
  history: SpecHistoryEvent[],
  livingCapabilities: string[]
): SpecHistoryEvent[] {
  const living = new Set(livingCapabilities);
  return [...latestByCapability(history).values()].filter(
    (event) => event.operation === "deleted" && !living.has(event.capability)
  );
}

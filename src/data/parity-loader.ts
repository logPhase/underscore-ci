/**
 * parity-loader.ts — getter-style data adapter over store-held analysis data.
 *
 * The webapp's dataLoader.ts keeps the analysis snapshot in module-global
 * state and exposes plain getter functions. The desktop instead holds the
 * transformed snapshot on the use-analysis zustand store (transformedData).
 * This adapter exposes the SAME function names, backed by the store, so
 * webapp components port without rewriting their data access.
 *
 * Notes for consumers:
 *   - Each call reads the CURRENT store snapshot (useAnalysis.getState()),
 *     so these are safe in event handlers and render bodies alike. To
 *     re-render when a new run loads, components should still subscribe via
 *     `useAnalysis(s => s.transformedData)` (or any selector off it).
 *   - Derived caches (the PR-change map) are memoized per TransformedData
 *     object identity. loadRun produces a fresh object, which resets every
 *     cache — mirroring the webapp's explicit memo resets in
 *     transformToFrontendFormat.
 */

import { useAnalysis } from "@/store/use-analysis-store";
import type {
  MethodIndexEntry,
  PROverlayData,
  TransformedData,
} from "@/types/analysis";
import type { Chapter } from "@/types/journey";
import type { PrOverview, PrOverviewRole } from "@/types/intent";

const stripArgs = (s: string) => s.replace(/\(.*$/, "").trim();

// ── Store access + memo lifecycle ────────────────────────────────────

let _memoSource: TransformedData | null = null;
let _prChangeByFqn: Map<string, PrChange> | null = null;

/** Current snapshot off the analysis store. Resets all derived caches when
 *  the store holds a different TransformedData object than last time. */
function data(): TransformedData | null {
  const d = useAnalysis.getState().transformedData;
  if (d !== _memoSource) {
    _memoSource = d;
    _prChangeByFqn = null;
  }
  return d;
}

// ── Chapter store accessors ──────────────────────────────────────────

export function getChapters(): Chapter[] {
  return data()?.chapters ?? [];
}

export function getChapterById(id: string): Chapter | null {
  return data()?.chapterById.get(id) || null;
}

export function getChapterBySlug(slug: string): Chapter | null {
  return data()?.chapterBySlug.get(slug) || null;
}

export function getChaptersForFunction(fqn: string): string[] {
  return data()?.functionToChapters.get(fqn) || [];
}

// ── Global method index ──────────────────────────────────────────────
// The desktop builds this in lib/transform-data/call-graph.ts
// (buildMethodIndex — same join as the webapp's buildGlobalMethodIndex).

/** Look up a method by its FQN across all files */
export function getMethodInfo(fqn: string): MethodIndexEntry | undefined {
  return data()?.globalMethodIndex.get(fqn);
}

// ── PR overlay ───────────────────────────────────────────────────────

export function getPROverlay(): PROverlayData | null {
  return data()?.prOverlay ?? null;
}

export function hasPROverlay(): boolean {
  return getPROverlay() !== null;
}

// ── Method-level PR change lookup ────────────────────────────────────
// Used to highlight BPMN elements that cite a touched FQN. Strips
// generic args after the method name so `Foo.Bar(int)` and `Foo.Bar`
// both resolve — the BPMN agent occasionally drops parameter lists.
// The webapp builds this map once in setPROverlay; here it's memoized
// lazily against the TransformedData identity (same reset lifecycle as
// the other derived caches).

export type PrChange = "added" | "modified" | "deleted";

export function getPrChangeByFqn(): Map<string, PrChange> {
  data(); // arm the identity-based cache reset
  if (_prChangeByFqn) return _prChangeByFqn;
  // Index BOTH the full FQN and the args-stripped form so the BPMN
  // agent's terser FQNs (sometimes missing parameter lists) still resolve.
  const m = new Map<string, PrChange>();
  for (const s of getPROverlay()?.snapshots ?? []) {
    if (!s.fqn || !s.change) continue;
    const change = s.change as PrChange;
    m.set(s.fqn, change);
    m.set(stripArgs(s.fqn), change);
  }
  _prChangeByFqn = m;
  return m;
}

/** Look up a single FQN's change, tolerating arg-stripped matches. */
export function lookupPrChange(fqn: string): PrChange | null {
  if (!fqn) return null;
  const m = getPrChangeByFqn();
  return m.get(fqn) ?? m.get(stripArgs(fqn)) ?? null;
}

/** Pick the most prominent change among multiple FQNs.
 *  added > modified > deleted > none. */
const PR_CHANGE_RANK: Record<PrChange, number> = {
  added: 3,
  modified: 2,
  deleted: 1,
};
export function mostProminentChange(
  fqns: string[] | null | undefined,
): PrChange | null {
  if (!fqns || fqns.length === 0) return null;
  let best: PrChange | null = null;
  for (const f of fqns) {
    const c = lookupPrChange(f);
    if (!c) continue;
    if (!best || PR_CHANGE_RANK[c] > PR_CHANGE_RANK[best]) best = c;
  }
  return best;
}

// ── PR Overview (journey-connection agent) ───────────────────────────

export function getPrOverview(): PrOverview | null {
  return data()?.prOverview ?? null;
}

/** Role entry for one journey id (exact match). */
export function getJourneyRole(journeyId: string): PrOverviewRole | null {
  return getPrOverview()?.journeys?.find((j) => j.id === journeyId) ?? null;
}

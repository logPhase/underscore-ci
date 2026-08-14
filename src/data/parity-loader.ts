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
    _callersByFqn = null;
  }
  return d;
}

// ── Reverse call index ───────────────────────────────────────────────
// `calls` is fqn → callees. A journey's own edge list often does NOT
// contain a method's caller — the composed journey is a slice, and a
// method whose caller fell outside that slice has no inbound edge, so
// `deriveRoots` draws it as an entry point. Observed on iris PR-685:
// BarrierOpenDispatcher.RecordBarrierOpenAsShadowEventAsync rendered as a
// starting method, while the global map plainly recorded
// DispatchActuationAsync calling it.
//
// The whole map is already in the payload, so the honest answer to "who
// calls this?" costs one lazily-built reverse index.
let _callersByFqn: Map<string, string[]> | null = null;

const paramless = (fqn: string) => fqn.split("(")[0];

function callersIndex(): Map<string, string[]> {
  // `data()` is what DETECTS a payload swap and clears the memo, so it has
  // to run before the cache is consulted. Checking `_callersByFqn` first
  // returns the previous report's index forever — the caller list would
  // silently belong to whichever payload happened to load first.
  const d = data();
  if (_callersByFqn) return _callersByFqn;
  const idx = new Map<string, string[]>();
  const calls = d?.calls ?? {};
  for (const [caller, callees] of Object.entries(calls)) {
    for (const callee of (callees as string[]) ?? []) {
      // Key on the paramless form: callers cite overloads inconsistently,
      // and a caller list that silently misses an overload is worse than
      // one that occasionally merges two.
      const k = paramless(callee);
      const list = idx.get(k);
      if (list) {
        if (!list.includes(caller)) list.push(caller);
      } else {
        idx.set(k, [caller]);
      }
    }
  }
  _callersByFqn = idx;
  return idx;
}

/** Every method that calls `fqn`, from the GLOBAL call map — including
 *  callers the current journey's slice leaves out. Empty for a genuine
 *  entry point, which is what makes it worth showing: "no callers" and
 *  "callers exist but not in this journey" must not look identical. */
export function getCallers(fqn: string): string[] {
  if (!fqn) return [];
  return callersIndex().get(paramless(fqn)) ?? [];
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

/** Aggregate per-FQN changes into ONE element-level status.
 *
 *  A BPMN element cites MANY grounding FQNs — often a whole call chain —
 *  and unchanged methods never appear in the change map, so "any cited FQN
 *  added → element added" painted reused pipelines green whenever the PR
 *  added one thin wrapper into them (bahmni PR#180: a task labeled
 *  "existing, unchanged data pipeline" rendered as newly added). Honest
 *  rule, counting unmatched FQNs as unchanged evidence:
 *    - ALL matches added AND a majority of cited → 'added' (genuinely new)
 *    - all matches deleted (and majority)        → 'deleted'
 *    - any other mix of changes                  → 'modified' (touched)
 *    - no matches at all                         → null      (untouched) */
export function aggregateElementChange(
  changes: readonly (PrChange | null)[],
): PrChange | null {
  const n = changes.length;
  const matched = changes.filter((c): c is PrChange => c != null);
  if (matched.length === 0) return null;
  const added = matched.filter((c) => c === 'added').length;
  const deleted = matched.filter((c) => c === 'deleted').length;
  if (added === matched.length && added * 2 > n) return 'added';
  if (deleted === matched.length && deleted * 2 > n) return 'deleted';
  return 'modified';
}

export function mostProminentChange(
  fqns: string[] | null | undefined,
): PrChange | null {
  if (!fqns || fqns.length === 0) return null;
  return aggregateElementChange(fqns.map((f) => lookupPrChange(f)));
}

// ── PR Overview (journey-connection agent) ───────────────────────────

export function getPrOverview(): PrOverview | null {
  return data()?.prOverview ?? null;
}

/** Role entry for one journey id (exact match). */
export function getJourneyRole(journeyId: string): PrOverviewRole | null {
  return getPrOverview()?.journeys?.find((j) => j.id === journeyId) ?? null;
}

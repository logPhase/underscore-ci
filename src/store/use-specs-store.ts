import {
  latestByCapability,
  previousVersionOf,
  removedCapabilities,
} from "@/lib/specs/history";
import {
  removedRequirementCount,
  touchedRequirements,
  type ReqChange,
} from "@/lib/specs/req-diff";
import type {
  SpecEntry,
  SpecHistoryEvent,
  SpecVersionContent,
  SpecsPayload,
} from "@/types/specs";
import { create } from "zustand";

// In the static report there is no network: the whole specs bundle — living
// specs, history, and every referenced version's content — is baked into the
// payload by the CLI. This store is a payload-driven mirror of the desktop's
// use-specs-store (which fetched over IPC): `load` seeds from a SpecsPayload,
// and diffs / change-bars are looked up in the embedded `versions` map instead
// of fetched. A version_id absent from the map means its content wasn't
// exported — treated as "unavailable" and skipped, never an error.

export type SpecsStatus = "idle" | "ready" | "empty";

export interface SpecDiff {
  event: SpecHistoryEvent;
  /** null for a `created` event (or when the previous version's content
   *  wasn't exported) — the diff renders against empty. */
  before: SpecVersionContent | null;
  after: SpecVersionContent;
}

interface SpecsState {
  repoId: string | null;
  status: SpecsStatus;
  specs: SpecEntry[];
  history: SpecHistoryEvent[];
  /** version_id → full content, as exported by the CLI (newest-first, capped). */
  versions: Record<string, SpecVersionContent>;
  selected: string | null;
  view: "spec" | "history";
  diff: SpecDiff | null;
  /** Set when a requested revision's content wasn't exported — a quiet note,
   *  not a failure. */
  diffError: string | null;
  /** capability → reqNo → new|changed, vs the previous revision. Drives the
   *  margin change bars; absent until ensureReqChanges runs. */
  reqChanges: Record<string, Map<number, ReqChange>>;
  /** capability → count of requirements the latest revision dropped. */
  removedReqCounts: Record<string, number>;
  load(payload: SpecsPayload): void;
  select(capability: string): void;
  setView(view: "spec" | "history"): void;
  openDiff(event: SpecHistoryEvent): void;
  closeDiff(): void;
  ensureReqChanges(capability: string): void;
}

export const useSpecsStore = create<SpecsState>()((set, get) => ({
  repoId: null,
  status: "idle",
  specs: [],
  history: [],
  versions: {},
  selected: null,
  view: "spec",
  diff: null,
  diffError: null,
  reqChanges: {},
  removedReqCounts: {},

  load: (payload) => {
    const specs = payload.specs ?? [];
    const history = payload.history ?? [];
    const versions = payload.versions ?? {};

    // Default selection: the most recently changed capability (the entry
    // anchor), falling back to the first living spec. Preserve the current
    // selection if it still exists (a payload re-load shouldn't lose the place).
    const latest = latestByCapability(history);
    const byActivity = [...specs].sort((a, b) => {
      const atA = latest.get(a.capability)?.at ?? "";
      const atB = latest.get(b.capability)?.at ?? "";
      return atB.localeCompare(atA);
    });
    const current = get().selected;
    const selected =
      current && specs.some((s) => s.capability === current)
        ? current
        : (byActivity[0]?.capability ?? null);

    // Empty only when there is nothing to show at all — no living specs AND no
    // superseded capabilities (a deleted-only capability still has a diff).
    const hasContent =
      specs.length > 0 ||
      removedCapabilities(
        history,
        specs.map((s) => s.capability)
      ).length > 0;

    set({
      repoId: payload.repo_id,
      status: hasContent ? "ready" : "empty",
      specs,
      history,
      versions,
      selected,
      diff: null,
      diffError: null,
      reqChanges: {},
      removedReqCounts: {},
    });
  },

  select: (capability) =>
    set({ selected: capability, view: "spec", diff: null, diffError: null }),

  setView: (view) => set({ view, diff: null, diffError: null }),

  openDiff: (event) => {
    const { history, versions } = get();
    const after = versions[event.version_id] ?? null;
    // The target revision's content wasn't exported — nothing to diff. Skip
    // gracefully with a note; the living spec still reads.
    if (!after) {
      set({
        diff: null,
        diffError: "This revision's content wasn't captured in this report.",
      });
      return;
    }
    const prevEvent = previousVersionOf(history, event.version_id);
    const before = prevEvent ? (versions[prevEvent.version_id] ?? null) : null;
    set({ diff: { event, before, after }, diffError: null });
  },

  closeDiff: () => set({ diff: null, diffError: null }),

  ensureReqChanges: (capability) => {
    const { history, specs, versions, reqChanges } = get();
    if (capability in reqChanges) return;
    const latest = history.find((e) => e.capability === capability);
    // Change bars only make sense for a revision; a `created` spec is all new
    // by definition and the created badge already says so.
    if (!latest || latest.operation !== "updated") return;
    const spec = specs.find((s) => s.capability === capability);
    const prevEvent = previousVersionOf(history, latest.version_id);
    if (!spec || !prevEvent) return;
    const prev = versions[prevEvent.version_id];
    // Previous content unavailable → no bars. The spec still reads without them.
    if (!prev) return;

    set((s) => ({
      reqChanges: {
        ...s.reqChanges,
        [capability]: touchedRequirements(prev.content, spec.content),
      },
      removedReqCounts: {
        ...s.removedReqCounts,
        [capability]: removedRequirementCount(prev.content, spec.content),
      },
    }));
  },
}));

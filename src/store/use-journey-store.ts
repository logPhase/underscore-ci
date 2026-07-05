import { create } from "zustand";
import { useViewportStore } from "./use-viewport-store";
import { toSemanticLevel } from "@/lib/canvas/utils";
import { useSelectionStore } from "./use-selection-store";

// ─── 7. Journey slice ─────────────────────────────────────────────────────────
// Active journey + phase. Saves and restores the viewport when entering/exiting.

// Minimal journey shape — expand to match your full JourneyData type.
// Keeping it generic here so the store doesn't import from dataLoader.
export interface JourneyPhaseData {
  name: string;
  narrative: string;
  fqns: string[]; // full FQNs for graph lookup
}

export interface JourneyStepData {
  fqn: string;
  name: string;
  class: string;
  service: string;
  file: string;
  phaseIdx: number;
  /** Step-level PR state ("added" | "modified" | "deleted" | "disconnected"). */
  prStatus?: string;
}

export interface JourneyData {
  id: string;
  title: string;
  entryFqn: string;
  handlerType: "command" | "event" | "background" | "http";
  phases: JourneyPhaseData[];
  steps: JourneyStepData[];
  edges: [string, string][];
  // Narrative/PR fields carried through from the raw journey so canvas-side
  // consumers don't silently lose them (chapters remain the full surface —
  // step bodies, BPMN payloads, and step-level PR data live there).
  summary?: string;
  criticality?: string;
  status?: string;
  prStatus?: string;
  hasBpmn?: boolean;
  [key: string]: unknown;
}

/** How many journey lines can be lit at once — beyond 3 the map stops
 *  reading as a diagram (chunk budget) and line colors stop being
 *  distinguishable. Oldest line drops when a 4th is toggled on. */
export const MAX_JOURNEY_LINES = 3;

interface JourneySlice {
  activeJourney: JourneyData | null;
  activePhaseIdx: number | null;
  /** Journey ids rendered as transit lines on the canvas, activation order. */
  activeLineIds: string[];
  /** Snapshot of viewport taken when a journey was activated. */
  _preJourneyViewport: { pan: { x: number; y: number }; zoom: number } | null;

  /**
   * Activate a journey. Snapshot the current viewport first so it can be
   * restored when the journey is dismissed.
   */
  activateJourney: (journey: JourneyData) => void;
  deactivateJourney: () => void;
  selectPhase: (idx: number | null) => void;
  /** Toggle a journey's transit line on/off (FIFO-capped at MAX_JOURNEY_LINES). */
  toggleLine: (journeyId: string) => void;
  clearLines: () => void;
}

export const useJourneyStore = create<JourneySlice>()((set) => ({
  activeJourney: null,
  activePhaseIdx: null,
  activeLineIds: [],
  _preJourneyViewport: null,

  toggleLine: (journeyId) => {
    set((s) => {
      const on = s.activeLineIds.includes(journeyId);
      const next = on
        ? s.activeLineIds.filter((id) => id !== journeyId)
        : [...s.activeLineIds, journeyId].slice(-MAX_JOURNEY_LINES);
      return { activeLineIds: next };
    });
    // Transit lines and the method-detail selection are different reading
    // modes — toggling a line clears any function selection.
    useSelectionStore.getState().clearSelection();
  },

  clearLines: () => set({ activeLineIds: [] }),

  activateJourney: (journey) => {
    // Snapshot current viewport from the viewport store (cross-store read).
    const { pan, zoom } = useViewportStore.getState();
    set({
      activeJourney: journey,
      activePhaseIdx: null,
      _preJourneyViewport: { pan, zoom },
    });
    // Clear selection state so call-chain panel doesn't conflict.
    useSelectionStore.getState().clearSelection();
  },

  deactivateJourney: () => {
    set((s) => {
      if (s._preJourneyViewport) {
        // Restore viewport without animation so it's instant.
        useViewportStore.setState({
          pan: s._preJourneyViewport.pan,
          zoom: s._preJourneyViewport.zoom,
          semanticZoomLevel: toSemanticLevel(s._preJourneyViewport.zoom),
        });
      }
      return {
        activeJourney: null,
        activePhaseIdx: null,
        activeLineIds: [],
        _preJourneyViewport: null,
      };
    });
  },

  selectPhase: (idx) =>
    set((s) => ({ activePhaseIdx: s.activePhaseIdx === idx ? null : idx })),
}));

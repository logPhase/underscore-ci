import { create } from "zustand";

// ─── Journey UI slice ─────────────────────────────────────────────────────────
// Cross-panel sync for the journey detail view.
// Replaces JourneyContext — no Provider needed, import the hook directly.
//
// interactionSource prevents feedback loops: when the chapter panel sets
// hoveredFunctionId, the graph panel checks source !== 'chapter' before
// reacting, and vice versa.

type InteractionSource = "chapter" | "graph" | null;

interface JourneyUISlice {
  hoveredFunctionId: string | null;
  activeFunctionId: string | null;
  hoveredServiceId: string | null;
  interactionSource: InteractionSource;

  setHoveredFunctionId: (id: string | null, source?: InteractionSource) => void;
  /** Toggles: calling with the current activeFunctionId clears it. */
  setActiveFunctionId: (id: string | null, source?: InteractionSource) => void;
  setHoveredServiceId: (id: string | null) => void;
  setInteractionSource: (source: InteractionSource) => void;
  clearJourneyUI: () => void;
}

export const useJourneyUIStore = create<JourneyUISlice>()((set) => ({
  hoveredFunctionId: null,
  activeFunctionId: null,
  hoveredServiceId: null,
  interactionSource: null,

  setHoveredFunctionId: (id, source) =>
    set({
      hoveredFunctionId: id,
      ...(source !== undefined && { interactionSource: source }),
    }),

  setActiveFunctionId: (id, source) =>
    set((s) => ({
      activeFunctionId: s.activeFunctionId === id ? null : id,
      ...(source !== undefined && { interactionSource: source }),
    })),

  setHoveredServiceId: (hoveredServiceId) => set({ hoveredServiceId }),

  setInteractionSource: (interactionSource) => set({ interactionSource }),

  clearJourneyUI: () =>
    set({
      hoveredFunctionId: null,
      activeFunctionId: null,
      hoveredServiceId: null,
      interactionSource: null,
    }),
}));

import { CallChainNode, SelectedFunctionCtx } from "@/types/store";
import { create } from "zustand";

// ─── 5. Selection / call-chain slice ─────────────────────────────────────────
// Selected method + its computed call-chain graph.

interface SelectionSlice {
  selectedFunctionCtx: SelectedFunctionCtx | null;
  activeParamTrace: { paramName: string; functionId: string } | null;
  callChainNodes: CallChainNode[];
  activeCallChain: CallChainNode[] | null;
  callChainCursorFqn: string | null;

  setSelectedFunctionCtx: (ctx: SelectedFunctionCtx | null) => void;
  setActiveParamTrace: (
    trace: { paramName: string; functionId: string } | null
  ) => void;
  setCallChainNodes: (nodes: CallChainNode[]) => void;
  setActiveCallChain: (chain: CallChainNode[] | null) => void;
  setCallChainCursorFqn: (fqn: string | null) => void;
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionSlice>()((set) => ({
  selectedFunctionCtx: null,
  activeParamTrace: null,
  callChainNodes: [],
  activeCallChain: null,
  callChainCursorFqn: null,

  setSelectedFunctionCtx: (selectedFunctionCtx) => set({ selectedFunctionCtx }),
  setActiveParamTrace: (activeParamTrace) => set({ activeParamTrace }),
  setCallChainNodes: (callChainNodes) => set({ callChainNodes }),
  setActiveCallChain: (activeCallChain) => set({ activeCallChain }),
  setCallChainCursorFqn: (callChainCursorFqn) => set({ callChainCursorFqn }),
  clearSelection: () =>
    set({
      selectedFunctionCtx: null,
      activeParamTrace: null,
      activeCallChain: null,
      callChainCursorFqn: null,
    }),
}));

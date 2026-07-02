import { create } from "zustand";

// ─── 6. Navigation history slice ─────────────────────────────────────────────

import { NavigationEntry } from "@/types/store";

interface NavigationSlice {
  navigationHistory: NavigationEntry[];

  pushNavigation: (entry: NavigationEntry) => void;
  togglePinNavigation: (targetId: string) => void;
  clearNavigationHistory: () => void;
}

export const useNavigationStore = create<NavigationSlice>()((set) => ({
  navigationHistory: [],

  pushNavigation: (entry) =>
    set((s) => {
      const filtered = s.navigationHistory.filter(
        (e) => e.targetId !== entry.targetId
      );
      return { navigationHistory: [entry, ...filtered].slice(0, 7) };
    }),

  togglePinNavigation: (targetId) =>
    set((s) => ({
      navigationHistory: s.navigationHistory.map((e) =>
        e.targetId === targetId ? { ...e, pinned: !e.pinned } : e
      ),
    })),

  clearNavigationHistory: () => set({ navigationHistory: [] }),
}));

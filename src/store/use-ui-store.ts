import { HealthSubStain, ViewType } from "@/types/store";
import { create } from "zustand";

// ─── 2. UI state slice ────────────────────────────────────────────────────────
// Toolbar, search, views — things that change infrequently and don't need
// to re-render the SVG canvas.

interface UISlice {
  activeView: ViewType;
  healthSubStain: HealthSubStain;
  prMode: boolean;
  searchOpen: boolean;
  timelineMonth: number;
  loadPhase: number;
  helpOpen: boolean;

  setActiveView: (v: ViewType) => void;
  setHealthSubStain: (s: HealthSubStain) => void;
  setPrMode: (on: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setTimelineMonth: (m: number) => void;
  setLoadPhase: (p: number) => void;
  setHelpOpen: (helpOpen: boolean) => void;
}

export const useUIStore = create<UISlice>()((set) => ({
  activeView: "structure",
  healthSubStain: "combined",
  prMode: false,
  searchOpen: false,
  timelineMonth: 11,
  loadPhase: 0,
  helpOpen: false,

  setActiveView: (activeView) => set({ activeView }),
  setHealthSubStain: (healthSubStain) => set({ healthSubStain }),
  setPrMode: (prMode) => set({ prMode }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setTimelineMonth: (timelineMonth) => set({ timelineMonth }),
  setLoadPhase: (loadPhase) => set({ loadPhase }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
}));

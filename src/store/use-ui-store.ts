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
  // Show/hide the agent-derived group hulls. Default on — grouping is the
  // overview-first reading (#23). Pure render toggle in the static report:
  // the layout is always applied, this only controls whether the hulls draw.
  groupingVisible: boolean;
  // Session-shell left rail collapsed to a 56px icon rail. Default expanded.
  // Not persisted — a per-session view preference.
  railCollapsed: boolean;

  setActiveView: (v: ViewType) => void;
  setHealthSubStain: (s: HealthSubStain) => void;
  setPrMode: (on: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setTimelineMonth: (m: number) => void;
  setLoadPhase: (p: number) => void;
  setHelpOpen: (helpOpen: boolean) => void;
  setGroupingVisible: (groupingVisible: boolean) => void;
  setRailCollapsed: (railCollapsed: boolean) => void;
  toggleRail: () => void;
}

export const useUIStore = create<UISlice>()((set) => ({
  activeView: "structure",
  healthSubStain: "combined",
  prMode: false,
  searchOpen: false,
  timelineMonth: 11,
  loadPhase: 0,
  helpOpen: false,
  groupingVisible: true,
  railCollapsed: false,

  setActiveView: (activeView) => set({ activeView }),
  setHealthSubStain: (healthSubStain) => set({ healthSubStain }),
  setPrMode: (prMode) => set({ prMode }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setTimelineMonth: (timelineMonth) => set({ timelineMonth }),
  setLoadPhase: (loadPhase) => set({ loadPhase }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setGroupingVisible: (groupingVisible) => set({ groupingVisible }),
  setRailCollapsed: (railCollapsed) => set({ railCollapsed }),
  toggleRail: () => set((s) => ({ railCollapsed: !s.railCollapsed })),
}));

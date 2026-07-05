import { HealthSubStain, ViewType } from "@/types/store";
import { create } from "zustand";

// ─── 2. UI state slice ────────────────────────────────────────────────────────
// Toolbar, search, views — things that change infrequently and don't need
// to re-render the SVG canvas.

// Right-side code panels (FileCodePanel + MethodDetailPanel share one width so
// switching between a file and one of its methods never resizes the slot).
// Clamped 360–900px and persisted across sessions — a reader who widened the
// panel to stop lines wrapping shouldn't have to redo it every visit.
const PANEL_WIDTH_KEY = "underscore.codePanelWidth";
export const PANEL_WIDTH_MIN = 360;
export const PANEL_WIDTH_MAX = 900;
const PANEL_WIDTH_DEFAULT = 576; // = Tailwind w-xl (36rem), the previous fixed width

export const clampPanelWidth = (w: number): number =>
  Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX, Math.round(w)));

function readPanelWidth(): number {
  try {
    const raw = localStorage.getItem(PANEL_WIDTH_KEY);
    if (raw) return clampPanelWidth(Number(raw));
  } catch {
    /* ignore — no storage (file:// artifact / private mode) */
  }
  return PANEL_WIDTH_DEFAULT;
}

function writePanelWidth(w: number): void {
  try {
    localStorage.setItem(PANEL_WIDTH_KEY, String(w));
  } catch {
    /* ignore */
  }
}

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
  // Shared width of the right-side code panels (px). Persisted + clamped.
  codePanelWidth: number;

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
  setCodePanelWidth: (w: number) => void;
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
  codePanelWidth: readPanelWidth(),

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
  setCodePanelWidth: (w) => {
    const width = clampPanelWidth(w);
    writePanelWidth(width);
    set({ codePanelWidth: width });
  },
}));

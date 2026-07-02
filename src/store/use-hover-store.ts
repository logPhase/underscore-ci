import { create } from "zustand";

// ─── 3. Hover / blast slice ───────────────────────────────────────────────────
// High-frequency pointer events. Fully isolated so hover updates never
// touch selection or journey state.

type HoverTarget = {
  type: "service" | "shared" | "dep" | "file" | "package" | "method";
  id: string;
} | null;

interface HoverSlice {
  hoveredElement: HoverTarget;
  blastTarget: string | null;

  setHoveredElement: (e: HoverTarget) => void;
  setBlastTarget: (id: string | null) => void;
}

export const useHoverStore = create<HoverSlice>()((set) => ({
  hoveredElement: null,
  blastTarget: null,
  setHoveredElement: (hoveredElement) => set({ hoveredElement }),
  setBlastTarget: (blastTarget) => set({ blastTarget }),
}));

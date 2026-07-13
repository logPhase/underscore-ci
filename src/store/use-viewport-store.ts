import { nextSemanticLevel } from "@/lib/canvas/utils";
import { create } from "zustand";

// ─── 1. Viewport slice ───────────────────────────────────────────────────────
// Pan, zoom, animating. High-frequency updates isolated here.

interface ViewportSlice {
  pan: { x: number; y: number };
  zoom: number;
  animating: boolean;
  semanticZoomLevel: number; // derived, kept here for convenience

  setPan: (p: { x: number; y: number }) => void;
  setZoom: (z: number) => void;
  setAnimating: (a: boolean) => void;
  /**
   * Animate the viewport to center world-point (cx, cy) at targetZoom.
   * viewportW/H are the current dimensions of the canvas container.
   */
  zoomTo: (
    cx: number,
    cy: number,
    targetZoom: number,
    viewportW: number,
    viewportH: number
  ) => void;
}

export const useViewportStore = create<ViewportSlice>()((set, get) => ({
  pan: { x: 0, y: 0 },
  zoom: 0.55,
  animating: false,
  semanticZoomLevel: 0,

  setPan: (pan) => set({ pan }),

  setZoom: (zoom) => {
    const clamped = Math.max(0.1, Math.min(12, zoom));
    set({
      zoom: clamped,
      semanticZoomLevel: nextSemanticLevel(get().semanticZoomLevel, clamped),
    });
  },

  setAnimating: (animating) => set({ animating }),

  zoomTo: (cx, cy, targetZoom, viewportW, viewportH) => {
    const clamped = Math.max(0.1, Math.min(12, targetZoom));
    set({
      animating: true,
      zoom: clamped,
      semanticZoomLevel: nextSemanticLevel(get().semanticZoomLevel, clamped),
      pan: {
        x: viewportW / 2 - cx * clamped,
        y: viewportH / 2 - cy * clamped,
      },
    });
    setTimeout(() => set({ animating: false }), 950);
  },
}));

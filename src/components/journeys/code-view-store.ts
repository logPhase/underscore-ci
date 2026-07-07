import { create } from "zustand";

// ─── Shared code-view state ──────────────────────────────────────────────
// Two things live here, shared across the chapter/BPMN surfaces:
//   1. `width` — the chosen width of the code surfaces (the right-docked
//      CODE panel AND the centered step-functions dialog). One value drives
//      both so the reader's preferred width sticks as they move between
//      steps. Persisted to localStorage (same convention as the dock /
//      source-view prefs) so it survives reloads too.
//   2. `rightDock` — which of the two right-edge panels (Ask AI / Code) is
//      expanded. Both dock to the same edge; only one opens at a time, so
//      opening one collapses the other simply by writing this field.

export const CODE_WIDTH_MIN = 320;
export const CODE_WIDTH_MAX = 900;
export const CODE_WIDTH_DEFAULT = 460;
// One click of the wider/narrower buttons.
export const CODE_WIDTH_STEP = 80;

const WIDTH_KEY = "journey-code-width";

export function clampCodeWidth(w: number): number {
  return Math.max(CODE_WIDTH_MIN, Math.min(CODE_WIDTH_MAX, Math.round(w)));
}

function loadWidth(): number {
  try {
    const raw = localStorage.getItem(WIDTH_KEY);
    if (raw != null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return clampCodeWidth(n);
    }
  } catch (e) {
    console.error(e);
  }
  return CODE_WIDTH_DEFAULT;
}

export type RightDock = "ask" | "code" | null;

/** How a CHANGED method's source renders: the diff against base (default —
 * in a PR report the change IS the content) or just the current head body. */
export type CodeSourceView = "diff" | "current";

const SOURCE_VIEW_KEY = "journey-code-source-view";

function loadSourceView(): CodeSourceView {
  try {
    const saved = localStorage.getItem(SOURCE_VIEW_KEY);
    if (saved === "current" || saved === "diff") return saved;
    // legacy value from the old three-way toggle
    if (saved === "previous") return "current";
  } catch (e) {
    console.error(e);
  }
  return "diff";
}

interface CodeViewState {
  width: number;
  setWidth: (w: number) => void;
  rightDock: RightDock;
  setRightDock: (dock: RightDock) => void;
  /** Shared across every code surface (CODE dock, call-graph panel, step
   * dialog) so the reader's preference sticks as they move around. */
  sourceView: CodeSourceView;
  setSourceView: (view: CodeSourceView) => void;
}

export const useCodeView = create<CodeViewState>()((set) => ({
  width: loadWidth(),
  setWidth: (w) => {
    const width = clampCodeWidth(w);
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch (e) {
      console.error(e);
    }
    set({ width });
  },
  rightDock: null,
  setRightDock: (rightDock) => set({ rightDock }),
  sourceView: loadSourceView(),
  setSourceView: (sourceView) => {
    try {
      localStorage.setItem(SOURCE_VIEW_KEY, sourceView);
    } catch (e) {
      console.error(e);
    }
    set({ sourceView });
  },
}));

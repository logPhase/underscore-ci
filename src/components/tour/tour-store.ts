import { create } from "zustand";

/** localStorage flag — bump the suffix when the tour content changes enough
 *  that everyone should see it again. */
export const TOUR_FLAG_KEY = "underscore-tour-v1";

interface TourState {
  active: boolean;
  step: number;
  start: () => void;
  /** Ends the tour and records the outcome so it never auto-starts again.
   *  "done" = walked to the end, "skipped" = bailed early — same effect,
   *  kept distinct in storage for future tuning. */
  stop: (reason: "done" | "skipped") => void;
  setStep: (i: number) => void;
}

export const useTour = create<TourState>((set) => ({
  active: false,
  step: 0,
  start: () => set({ active: true, step: 0 }),
  stop: (reason) => {
    try {
      localStorage.setItem(TOUR_FLAG_KEY, reason);
    } catch {
      /* private mode / file:// — the tour just re-offers next visit */
    }
    set({ active: false, step: 0 });
  },
  setStep: (i) => set({ step: i }),
}));

/** Whether this browser has already seen (or skipped) the tour. Errors read
 *  as "seen" — never nag someone we can't remember. */
export function tourSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_FLAG_KEY) != null;
  } catch {
    return true;
  }
}

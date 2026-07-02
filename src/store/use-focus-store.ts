import { create } from "zustand";

// ─── 4. Focus / drill-down slice ─────────────────────────────────────────────
// Which service / package / file is currently drilled into.

interface FocusSlice {
  focusedServiceId: string | null;
  focusedPackageId: string | null;
  focusedFileId: string | null;

  setFocusedServiceId: (id: string | null) => void;
  setFocusedPackageId: (id: string | null) => void;
  setFocusedFileId: (id: string | null) => void;
  /** Clear all focus levels at once. */
  clearFocus: () => void;
}

export const useFocusStore = create<FocusSlice>()((set) => ({
  focusedServiceId: null,
  focusedPackageId: null,
  focusedFileId: null,

  setFocusedServiceId: (focusedServiceId) => set({ focusedServiceId }),
  setFocusedPackageId: (focusedPackageId) => set({ focusedPackageId }),
  setFocusedFileId: (focusedFileId) => set({ focusedFileId }),
  clearFocus: () =>
    set({
      focusedServiceId: null,
      focusedPackageId: null,
      focusedFileId: null,
    }),
}));

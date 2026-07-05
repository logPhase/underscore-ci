import { create } from "zustand";

// ─── 4. Focus / drill-down slice ─────────────────────────────────────────────
// Which service / package / file is currently drilled into.

interface FocusSlice {
  focusedServiceId: string | null;
  focusedPackageId: string | null;
  focusedFileId: string | null;
  /** File whose full-source panel is open. Tracked separately from
   *  focusedFileId (canvas expansion) so the code panel can be dismissed
   *  without collapsing the file's method circles, and vice versa. */
  codePanelFileId: string | null;

  setFocusedServiceId: (id: string | null) => void;
  setFocusedPackageId: (id: string | null) => void;
  setFocusedFileId: (id: string | null) => void;
  setCodePanelFileId: (id: string | null) => void;
  /** Clear all focus levels at once. */
  clearFocus: () => void;
}

export const useFocusStore = create<FocusSlice>()((set) => ({
  focusedServiceId: null,
  focusedPackageId: null,
  focusedFileId: null,
  codePanelFileId: null,

  setFocusedServiceId: (focusedServiceId) => set({ focusedServiceId }),
  setFocusedPackageId: (focusedPackageId) => set({ focusedPackageId }),
  setFocusedFileId: (focusedFileId) => set({ focusedFileId }),
  setCodePanelFileId: (codePanelFileId) => set({ codePanelFileId }),
  clearFocus: () =>
    set({
      focusedServiceId: null,
      focusedPackageId: null,
      focusedFileId: null,
      codePanelFileId: null,
    }),
}));

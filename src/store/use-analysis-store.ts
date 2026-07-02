import { transformToFrontendFormat } from "@/lib/transform-data";
import type { TransformedData } from "@/types/analysis";
import { create } from "zustand";
import { useUIStore } from "./use-ui-store";

type ReportStatus = "idle" | "loading" | "complete" | "error";

interface AnalysisState {
  status: ReportStatus;
  error: string | null;
  transformedData: TransformedData | null;
  loadReport(): Promise<void>;
}

/** Report mode has exactly one data source: the static pr-output.json emitted
 *  by the CI action. Marker contract with scripts/inject-report-data.mjs: in
 *  the singlefile artifact variant the JSON is inlined into the
 *  #underscore-report-data script tag (fetch() fails on file:// in some
 *  browsers), so the inline tag is read first; while its text is still the
 *  raw build-time marker (dev / multi-file Pages build) we fetch instead. */
const INLINE_DATA_ID = "underscore-report-data";

async function fetchReportJson(): Promise<unknown> {
  const embedded = document.getElementById(INLINE_DATA_ID)?.textContent?.trim();
  // Real payloads are JSON objects/arrays; the un-injected tag still holds the
  // raw __UNDERSCORE_REPORT_DATA__ marker. Detect structurally — the marker
  // string must NOT appear as a literal in this bundle, or the injector
  // (first-occurrence replace) would splice the JSON into the inlined JS.
  if (embedded && (embedded.startsWith("{") || embedded.startsWith("[")))
    return JSON.parse(embedded);
  const res = await fetch("./pr-output.json");
  if (!res.ok)
    throw new Error(`Failed to load pr-output.json (HTTP ${res.status})`);
  return await res.json();
}

export const useAnalysis = create<AnalysisState>()((set) => ({
  status: "idle",
  error: null,
  transformedData: null,

  loadReport: async () => {
    set({ status: "loading", error: null });
    try {
      const raw = await fetchReportJson();
      const transformedData = transformToFrontendFormat(raw as any);
      set({ status: "complete", error: null, transformedData });
      useUIStore.getState().setPrMode(transformedData.prOverlay !== null);
    } catch (err: any) {
      set({ status: "error", error: err?.message ?? "Failed to load report" });
    }
  },
}));

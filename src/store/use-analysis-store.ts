import { transformToFrontendFormat } from "@/lib/transform-data";
import { buildRepoModeData } from "@/lib/repo/build-repo-data";
import { fetchRepoManifest } from "@/lib/repo/load-manifest";
import { fetchViewers, type RepoViewer } from "@/lib/repo/viewers";
import type { TransformedData } from "@/types/analysis";
import type { RepoManifest } from "@/types/repo-manifest";
import { create } from "zustand";
import { useUIStore } from "./use-ui-store";

type ReportStatus = "idle" | "loading" | "complete" | "error";

interface AnalysisState {
  status: ReportStatus;
  error: string | null;
  transformedData: TransformedData | null;
  /** True when this deployment booted a repo HUB (repo-manifest.json present)
   *  instead of a single PR report. Drives the repo-mode rail + entry route. */
  repoMode: boolean;
  /** The repo hub manifest (PR index + global artifacts); null in report mode. */
  repoManifest: RepoManifest | null;
  /** Sibling repo viewers on this host (viewers.json) — the hub's repo
   *  switcher; null when the host serves a single repo. */
  repoViewers: RepoViewer[] | null;
  /** True when this deployment is the PORTAL (Level 0): no repo manifest, no
   *  report — just viewers.json listing every repo on the host. */
  portalMode: boolean;
  /** Manifest-first boot: repo HUB when a manifest is served, else the single
   *  report. The single entry point for both the '/' route and deep links. */
  boot(): Promise<void>;
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

export const useAnalysis = create<AnalysisState>()((set, get) => ({
  status: "idle",
  error: null,
  transformedData: null,
  repoMode: false,
  repoManifest: null,
  repoViewers: null,
  portalMode: false,

  boot: async () => {
    if (get().status !== "idle") return;
    set({ status: "loading", error: null });
    // Repo HUB first — a served repo-manifest.json means this deployment is a
    // repository home, not a single report. Absent (single-report demos,
    // file:// artifacts) → fall through to the report flow untouched.
    try {
      const manifest = await fetchRepoManifest();
      if (manifest) {
        set({
          status: "complete",
          error: null,
          repoMode: true,
          repoManifest: manifest,
          repoViewers: await fetchViewers(),
          transformedData: buildRepoModeData(manifest),
        });
        useUIStore.getState().setPrMode(false);
        return;
      }
    } catch {
      // A manifest probe failure is never fatal — try the report.
    }
    // PORTAL deployment (Level 0): no repo manifest, but the host lists its
    // repo viewers — render the all-repositories page instead of a report.
    try {
      const viewers = await fetchViewers();
      if (viewers && viewers.length > 0) {
        set({ status: "complete", error: null, portalMode: true,
              repoViewers: viewers });
        useUIStore.getState().setPrMode(false);
        return;
      }
    } catch {
      // viewers probe failure → plain single-report host
    }
    try {
      const raw = await fetchReportJson();
      const transformedData = transformToFrontendFormat(raw as any);
      set({ status: "complete", error: null, transformedData });
      useUIStore.getState().setPrMode(transformedData.prOverlay !== null);
    } catch (err: any) {
      set({ status: "error", error: err?.message ?? "Failed to load report" });
    }
  },

  // Retained for callers that specifically want the single-report load (and as
  // the report-mode branch of the entry route). boot() is the general entry.
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

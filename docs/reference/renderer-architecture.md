# Reference — renderer architecture

The exact boot contract, routes, stores, pages and types of the `src/` report renderer. Scope: what exists and where. Non-scope: why it is shaped this way ([the-report-renderer](../explanation/the-report-renderer.md)) and how to run it ([develop-the-renderer](../how-to/develop-the-renderer.md)). Audience: anyone editing the SPA.

## Boot contract

| File | Role |
|---|---|
| `src/main.tsx` | Entry. `applyTheme(loadTheme())` before first paint, imports the bundled `@fontsource` faces (JetBrains Mono, Literata, IBM Plex Mono, Fraunces), then `createRoot(...).render(<App/>)`. |
| `src/App.tsx` | `TooltipProvider` → `Toaster` → `PointerEventsGuard` → **`HashRouter`**, and the route table below. |
| `src/pages/entry.tsx` | The `/` route (`EntryLoader`). Calls `boot()`, then renders `RepoHub` in repo mode, `RepoPortal` in portal mode, or redirects to `/journeys` for a plain report. `STUCK_MS = 12_000` surfaces a reload button. |
| `src/store/use-analysis-store.ts` | `boot()` — manifest-first: `fetchRepoManifest()` → `fetchViewers()` → `fetchReportJson()`. `loadReport()` is the narrower single-report path. Sets `prMode` on the UI store from `transformedData.prOverlay !== null`. |
| `src/lib/transform-data/index.ts` | **The real transform.** `transformToFrontendFormat(raw: RawAnalysisJSON): TransformedData` — services, files, functions, dependencies, call chains, PR overlay, journeys and chapters, plus the AI overlays (specs, findings, PR overview, journey knowledge). Split across sibling modules (`call-graph.ts`, `journeys.ts`, `pr-overlay.ts`, `services.ts`, `synth-bpmn.ts`, …). |

`fetchReportJson()` reads `document.getElementById("underscore-report-data")`; if the text starts with `{` or `[` it parses it (the injected single-file artifact), otherwise it `fetch`es `./pr-output.json` (dev and the multi-file Pages build). That is the marker contract with `scripts/inject-report-data.mjs`.

> `src/data/transform-data.ts` is a same-named **constants** file (`FUNCTION_ROLE_COLORS`, `COLOR_PALETTE`, the `VALID_*` sets) — not the transform.

## Routes (`src/App.tsx`)

| Path | Component | Notes |
|---|---|---|
| `/` | `EntryLoader` | boots; renders hub/portal or redirects to `/journeys` |
| `/canvas` | `CanvasWorldPage` | the architecture map (biological world) |
| `/architecture` | `ArchitecturePage` | the analyzer's repository architecture diagram |
| `/journeys` | `JourneyPage` | the departures-board index |
| `/journeys/:chapterSlug` | `ChapterPage` | one journey's deep dive |
| `/specs` | `SpecsPage` | living EARS specs — payload-gated |
| `/vocabulary` | `VocabularyPage` | the ubiquitous language as a live Obsidian-style force graph (`lib/vocab-sim.ts` — seeded, fixed-timestep, deterministic at rest) — payload-gated |
| `/findings` | `FindingsPage` | correctness audit — payload-gated |
| `/home` | → `/canvas` | legacy deep-link redirect |
| `*` | `NotFound` | |

Everything but `/` nests under a pathless `SessionShell` layout route (`src/components/layout/session-shell.tsx`): a persistent left rail, its own 12-second load watchdog, and a redirect to `/` on load error. In repo mode the rail hides the Canvas and Journeys items. `sessionsIndexHref()` and `askEndpointHref()` both return `null` off http(s), so `file://` artifacts degrade quietly. HashRouter is mandatory — `file://` and hosted subpaths both depend on it.

## Repo hub and portal (`src/lib/repo/`)

| File | Role |
|---|---|
| `load-manifest.ts` | `fetchRepoManifest()` — inline `#underscore-repo-manifest` tag first, else `./repo-manifest.json`; normalizes and returns `null` unless `repo` is a string and `prs` an array. Never throws. |
| `viewers.ts` | `fetchViewers()` (`./viewers.json`), `resolveViewerLinks()` (active viewer by longest path-prefix match — the repo switcher), `repoEntries()`/`portalEntry()`, and the portfolio-card overview fetchers. |
| `build-repo-data.ts` | `buildRepoModeData(manifest)` — a synthetic `TransformedData` with the code-graph collections empty and only `architecture`/`specs`/`analyzerRepoId` filled, so those two pages render unchanged in repo mode. |
| `src/pages/repo-hub.tsx`, `repo-portal.tsx` | The repository home (architecture, specs, PR index) and the Level-0 all-repositories portal. |

## Zustand stores (`src/store/`)

| Store | Holds |
|---|---|
| `use-analysis-store` | Boot lifecycle: `status`, `error`, `transformedData`, `repoMode`, `repoManifest`, `repoViewers`, `portalMode`; actions `boot()`, `loadReport()`. The root data source. |
| `use-journey-store` | Active journey and phase, lit canvas transit lines (`activeLineIds`, FIFO-capped at `MAX_JOURNEY_LINES = 3`), and a viewport snapshot taken on enter/exit. |
| `use-navigation-store` | Canvas breadcrumb history (capped at 7 entries) plus pin toggling. |
| `use-selection-store` | Selected function context, its call-chain graph (`callChainNodes`, `activeCallChain`, cursor) and the active param trace. |
| `use-ui-store` | Chrome: `activeView`, `healthSubStain`, `prMode`, `searchOpen`, `helpOpen`, `groupingVisible`, `railCollapsed`, `loadPhase`, and `codePanelWidth` (360–900, default 576, persisted under `underscore.codePanelWidth`). |
| `use-specs-store` | Payload-driven specs mirror: `specs`, `history`, `versions`, `selected`, `view`, computed `diff` and change-bar data. No network. |
| `use-viewport-store` | High-frequency canvas viewport: `pan`, `zoom` (clamped 0.1–12), `animating`, `semanticZoomLevel`, animated `zoomTo()` (clears `animating` after 950 ms). |
| `use-focus-store` | Canvas drill-down: `focusedServiceId`/`focusedPackageId`/`focusedFileId` plus `codePanelFileId`, kept separate so dismissing the panel does not collapse method circles. |
| `use-hover-store` | Isolated pointer state: `hoveredElement`, `blastTarget` — separate so hover never re-renders selection or journey state. |
| `use-journey-ui-store` | Chapter ↔ graph sync: `hoveredFunctionId`, `activeFunctionId`, `hoveredServiceId`, and `interactionSource` ("chapter" \| "graph") to break feedback loops. |

## Pages (`src/pages/`)

| Page | Renders |
|---|---|
| `entry.tsx` | The boot route; hub, portal or report. |
| `journeys.tsx` | The departures board: each journey a lettered transit line of stops, Δ chips on PR-touched stops, a badge for journeys with a real composed BPMN diagram. |
| `canvas-world.tsx` | `ReactFlowProvider` + `BiologicalWorld` with the canvas overlays (PR banner, stats, help, grouping control, method detail, file code panel and chip, tooltip, journey lines). Redirects to `/` with no data. |
| `chapter.tsx` | Thin wrapper resolving `:chapterSlug` into `ChapterView` (business-flow frame, inline call graph, code panes, Ask). |
| `architecture.tsx` | The architecture diagram, including the derived system-context collapse. |
| `specs.tsx` | Capability list plus the EARS reader, revision history and version diff. Redirects to `/journeys` when `transformedData.specs` is absent. |
| `findings.tsx` | Finding cards (divergence versus bug), evidence-first. Redirects to `/journeys` when `transformedData.findings` is absent. |
| `repo-hub.tsx`, `repo-portal.tsx` | Repo mode and portal mode. |
| `NotFound.tsx` | 404 with a link back to `#/`. |

## Domain types (`src/types/`)

| File | Core types |
|---|---|
| `analysis.ts` | `RawAnalysisJSON` (the `pr-output.json` contract), `AnalysisData`, **`TransformedData`**; enums `FunctionRole`, `SemanticRole`, `ConfidenceLevel`, `ChangeType`, `Significance`; PR shapes `PROverlayData`, `PRData`, `PRSummary`, `PRSnapshot`; run-manifest and job/IPC leftovers from the desktop app. |
| `journey.ts` | `RawJourney`, `Chapter`, `ChapterStep`, step/phase types, `BpmnDiagram`, `ReviewSummary`, in-journey `Finding`, `ChapterPRStatus`, `StepPRStatus`. |
| `architecture.ts` | `ArchNode`, `ArchEdge`, `ArchLayer`, `ArchitecturePayload` and their kind/status enums. |
| `findings.ts` | `Finding` (kind, severity, confidence, expected/observed/excerpt/check, ledger `status`), `FindingCitation`, `FindingsPayload`. |
| `specs.ts` | `SpecEntry`, `SpecOperation`, `SpecHistoryEvent`, `SpecVersionContent`, `SpecsPayload`. |
| `intent.ts` | `PrOverview` (+ role and link types), `JourneyKnowledgeResponse` with per-step `Doc`/`Fact`/`KnowledgeSummary`. |
| `repo-manifest.ts` | `RepoManifest`, `RepoManifestPr` — the hub's contract with `scripts/publish-report.sh`. |
| `bpmn-ask.ts` | `BpmnAskRequest`/`Response`/`Result`, `BpmnAskCitation`, `buildAskRequest()`, and the vestigial `BPMN_ASK_IPC` constant (no importers). |
| `canvas.ts`, `grouping.ts`, `store.ts` | `CallChainEdge`/`MethodLayoutPosition`; module-group hulls; `NavigationEntry`, `SelectedFunctionCtx`, `CallChainNode`, `ViewType`, `HealthSubStain`. |

## Ask, the only network feature

`askEndpointHref()` (`src/lib/ask-endpoint.ts`) returns `null` off `http:`/`https:`, and otherwise matches the path against `^(.*\/)(reports|latest)\/[^/]*`; on a match it returns `<prefix>ask` — the viewer relay that injects analyzer auth server-side. Requests abort after `TIMEOUT_MS = 180_000`. `askAvailable()` gates `AskPanel`, which is mounted only from `ChapterView.tsx`, so a `file://` artifact renders no Ask affordance.

The chapter's call graph is `CallFlowGraph.tsx` (React Flow, with built-in pan/zoom/minimap), sharing its layout with `src/lib/callgraph/tree-layout.ts`. Mind the alias: `ChapterView.tsx` imports it as `CallFlowChart` (`import CallFlowChart from "./CallFlowGraph"`), so the *name* in that file points at the new component while the older SVG `CallFlowChart.tsx` sits unimported next to it.

The live business-flow renderer is `bpmn/BpmnCanvas.tsx` — a hand-rolled SVG canvas, **not** React Flow. `ChapterView.tsx` → `BpmnEditor.tsx` → `BpmnCanvas`. `BpmnEditor.tsx` and `CodePanel.tsx` are both live; `ChapterView.tsx` imports and renders each.

Two components under `src/components/journeys/` and `src/components/bpmn/` have no importers at all: `CallFlowChart.tsx` and `bpmn/BpmnFlow.tsx`. `BpmnFlow` is a React-Flow implementation of the same diagram that nothing mounts; it still shares `layout.ts` (via `flow-graph.ts`) with the live canvas, so layout changes are covered by `flow-graph.test.ts` even though the component itself is dead. Edit `BpmnCanvas` when you mean to change what users see.

# Reference — renderer architecture

The exact routes, stores, types, and boot contract of the `src/` report
renderer. Narrative: [the-report-renderer](../explanation/the-report-renderer.md).

## Boot contract

| File | Role |
|---|---|
| `src/main.tsx` | Entry. `applyTheme(loadTheme())` before first paint; imports bundled fonts (`@fontsource`); `createRoot(...).render(<App/>)`. |
| `src/App.tsx` | `TooltipProvider` + `Toaster` + `PointerEventsGuard` + `HashRouter`. Defines routes. |
| `src/pages/report-loader.tsx` | `/` route. On idle → `loadReport()`; on complete → `<Navigate to="/journeys" replace>`. 12s watchdog (`STUCK_MS`) → "Reload report" button. |
| `src/store/use-analysis-store.ts` | `loadReport()` → `fetchReportJson()` → `transformToFrontendFormat(raw)` → store `transformedData`; `prMode = (prOverlay !== null)`. |
| `src/lib/transform-data/index.ts` | **The real transform.** Builds services/files/functions/deps, grid layout when `raw.groups`, FQN indexes, call-chains, PR overlay, journeys+chapters, and attaches AI overlays (`prOverview`, `journeyKnowledge`, `sessionId`, `specs`, `findings`). |

**`fetchReportJson()`**: reads the `#underscore-report-data` script tag; if its
text looks like JSON (`{`/`[`) it `JSON.parse`s it (single-file artifact),
otherwise `fetch('./pr-output.json')` (dev / multi-file Pages). Marker contract
with `scripts/inject-report-data.mjs`.

> ⚠️ `src/data/transform-data.ts` is a same-named **constants** file (palettes,
> validation sets), *not* the transform. The transform is under `src/lib/`.

## Routes (`src/App.tsx`)

| Path | Component | Notes |
|---|---|---|
| `/` | `ReportLoader` | loads the payload, redirects to `/journeys` |
| `/canvas` | `CanvasWorldPage` | the architecture map |
| `/journeys` | `JourneyPage` | the departures-board index |
| `/journeys/:chapterSlug` | `ChapterPage` | one journey's deep-dive |
| `/specs` | `SpecsPage` | living EARS specs |
| `/findings` | `FindingsPage` | correctness audit |
| `/home` | → `/canvas` | legacy deep-link redirect |
| `*` | `NotFound` | |

The four data routes nest under a `<SessionShell>` layout route (persistent
~232px left rail; centralizes the "no report → redirect to loader" guard).
`sessionsIndexHref()`/`askEndpointHref()` return `null` off http(s), so `file://`
artifacts degrade gracefully. **HashRouter** is mandatory (file:// + subpaths).

## Zustand stores (`src/store/`)

| Store | Holds |
|---|---|
| `use-analysis-store` | Report lifecycle: `status`, `error`, `transformedData`, `loadReport()`. The root data source. |
| `use-journey-store` | Active journey + phase drill-down; lit canvas "transit lines" (`activeLineIds`, FIFO-capped at 3); viewport snapshot on enter/exit. |
| `use-navigation-store` | Canvas breadcrumb/back history (capped 7 waypoints) + pin toggling. |
| `use-selection-store` | Selected function + its call-chain graph (`callChainNodes`, `activeCallChain`, cursor) and active param trace. |
| `use-ui-store` | Chrome: `activeView`, `healthSubStain`, `prMode`, `searchOpen`, `helpOpen`, `groupingVisible`, `railCollapsed`, persisted `codePanelWidth` (360–900px). |
| `use-specs-store` | Payload-driven specs mirror: `specs`, `history`, `versions`, `selected`, `view`, computed `diff`, change-bar data. No network. |
| `use-viewport-store` | High-frequency canvas viewport: `pan`, `zoom` (0.1–12), `animating`, `semanticZoomLevel`, animated `zoomTo()`. |
| `use-focus-store` | Canvas drill-down focus: `focusedServiceId`/`focusedPackageId`/`focusedFileId` + `codePanelFileId` (separate so the panel dismisses without collapsing method circles). |
| `use-hover-store` | Isolated pointer state: `hoveredElement`, `blastTarget` — kept separate so hover never re-renders selection/journey state. |
| `use-journey-ui-store` | Chapter↔graph sync: `hoveredFunctionId`, `activeFunctionId`, `hoveredServiceId`, `interactionSource` ("chapter"\|"graph") to break feedback loops. |

## Pages / features (`src/pages/`)

| Page | Renders |
|---|---|
| `journeys.tsx` | Departures-board index; each journey a lettered transit LINE (route string of stops, amber Δ chips on PR-touched stops, `FlowBadge` for real BPMN). Search/filter → chapters. |
| `canvas-world.tsx` | `ReactFlowProvider` + `BiologicalWorld` (SVG) + overlays: `PRSummaryBanner`, `CodebaseStats`, `HelpMessage`, `GroupModulesControl`, `MethodDetailPanel`, `FileCodePanel`, `FileCodeChip`, `CanvasTooltip`, `JourneyLinesPanel`. |
| `chapter.tsx` | Thin wrapper: `:chapterSlug` via `useMatch` → `PRSummaryBanner` + `<ChapterView>` (BPMN + code + Ask). |
| `specs.tsx` | Capability list (newest first) + EARS reader / revision history / version diff; change bars; SUPERSEDED for deleted capabilities. Payload-gated. |
| `findings.tsx` | Review-agent `Finding` cards (divergence vs bug), evidence-first, low-confidence subdued, sorted severity→kind→confidence. Payload-gated. |

## Domain types (`src/types/`)

| File | Core types |
|---|---|
| `analysis.ts` | `RawAnalysisJSON` (the `pr-output.json` contract), `AnalysisData`, **`TransformedData`** (the central store object); enums `FunctionRole`, `SemanticRole`, `ConfidenceLevel`, `ChangeType`, `Significance`; PR shapes `PROverlayData`, `PRData`, `PRSummary`, `PRSnapshot`. |
| `journey.ts` | `RawJourney`, `Chapter`, `JourneyData`, step/phase types; `BpmnDiagram` (`= BpmnJourney`, `synthetic?` flag = call-trace fallback vs real AI diagram), `ReviewSummary`, in-journey `Finding`; `ChapterPRStatus`, `StepPRStatus`. |
| `canvas.ts` | `CallChainEdge`, `MethodLayoutPosition`. |
| `findings.ts` | `Finding` (kind divergence\|bug, severity/confidence high\|medium\|low, expected/observed/excerpt/check, ledger `status`), `FindingCitation`, `FindingsPayload`. |
| `specs.ts` | `SpecEntry`, `SpecHistoryEvent`, `SpecVersionContent`, `SpecsPayload`, `SpecOperation`. |
| `intent.ts` | `PrOverview` (narrative + `PrOverviewRole` + `PrOverviewLink`), `JourneyKnowledgeResponse` (per-step `Doc`s/`Fact`s/`KnowledgeSummary`). |
| `bpmn-ask.ts` | `BpmnAskRequest`/`Response`/`Result`, `BpmnAskCitation`, `buildAskRequest()`. (Comment still references the old Electron IPC channel.) |
| `store.ts` | `NavigationEntry`, `SelectedFunctionCtx`, `CallChainNode`, `ViewType`, `HealthSubStain`. |
| `grouping.ts` | module-group hulls. |

## The one live feature: Ask (`src/lib/ask-endpoint.ts`, `components/journeys/AskPanel.tsx`)

`askEndpointHref()` returns `null` unless served over http(s) from a
`…/reports/<dir>/` or `…/latest/<dir>/` path; it derives `POST <root>/ask`
(viewer injects analyzer auth server-side). `bpmnAsk()` POSTs with a 180s
timeout. `AskPanel` renders nothing in a `file://` artifact (`askAvailable()`
gate), mounted only from `ChapterView.tsx`. Latent ported components:
`BpmnEditor.tsx`, `BpmnCanvas.tsx`, `CodePanel.tsx`. Specs/findings/overview/
journey-knowledge are **baked into the payload**, not server-backed.
</content>

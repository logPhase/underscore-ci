# Architecture — the three repos

underscore-ci does not stand alone. It is one corner of a three-repo system.
Knowing which repo owns which concern is the single most useful thing to
internalise — it tells you where a change actually belongs.

```
┌──────────────────────────┐   read-only source of the       ┌───────────────────────────┐
│   underscore-desktop      │   backend + renderer            │      underscore-ci        │
│   (Electron app)          │ ───────────────────────────────►│   (this repo)             │
│                           │   built INTO the image          │                           │
│  • Clojure analysis CLI   │                                 │  • action.yml / entrypoint │
│  • Roslyn C# sidecar      │                                 │  • report renderer (fork) │
│  • the ORIGINAL renderer  │                                 │  • viewer / github-app    │
└──────────────────────────┘                                 └─────────────┬─────────────┘
                                                                            │ opt-in HTTP
                                                                            │ (enrichment)
                                                                            ▼
                                                          ┌───────────────────────────────┐
                                                          │   intent-drift-analyzer       │
                                                          │   (hosted FastAPI :8767)      │
                                                          │                               │
                                                          │  • BPMN synthesis (agents)    │
                                                          │  • PR overview / summaries    │
                                                          │  • correctness findings       │
                                                          │  • Neo4j knowledge graph      │
                                                          │  • holds the Anthropic key    │
                                                          └───────────────────────────────┘
```

## underscore-desktop — the upstream source

Path: `../underscore-desktop`. An Electron desktop app that is the **origin**
of two things underscore-ci ships:

1. **The analysis backend.** The Clojure/JVM `underscore-cli` and the .NET
   Roslyn sidecar live here (under `backend/`). underscore-ci **does not
   contain this code** — [`scripts/build-image.sh`](../../scripts/build-image.sh)
   builds the uberjar (`clojure -T:build uber`) and publishes the Roslyn DLL
   (`dotnet publish`) *from a sibling desktop checkout* at image-build time.
   **To change what the analysis does, you change underscore-desktop.**

2. **The renderer.** `src/` was originally copied verbatim from the desktop
   app's renderer and Electron-stripped. **It is now a fork** (decision recorded
   in `docs/plans/2026-07-02-underscore-ci-implementation.md`): the logPhase
   visual identity and the report-mode changes live here. Do **not** re-copy the
   desktop renderer over `src/` — port logic changes selectively instead.

The desktop repo is treated as **read-only** by work here. Its `KEEPOUTS.md`
rule still binds: server-backed features (AskPanel, re-analyze, auth chrome)
are *hidden* in the report, never mocked. See
[the-report-renderer](the-report-renderer.md).

## intent-drift-analyzer — the AI layer

Path: `../intent-drift-analyzer`. A single hosted FastAPI service (`:8767`) that
is the **only network surface** for AI enrichment. Given a PR's journeys and
source it produces:

- **BPMN-lite business-flow diagrams** (`POST /bpmn`, its flagship route) — and,
  as a side effect, living EARS specs and an architecture journal.
- **PR overview narrative** (`POST /overview`) and per-journey **summaries**
  (`POST /summarize`).
- **Correctness findings** (`POST /review/correctness`) — currently disabled in
  its production for token spend, but underscore-ci plumbs `findings: on` for it.
- **Grounded Q&A** (`POST /ask`, `/bpmn/ask`) — the only *live* feature the
  report can call, via the viewer's `/ask` relay.
- Module **grouping** for the canvas (`POST /grouping`).

The analyzer **never touches the filesystem or runs git** — the Clojure CLI
uploads everything via `POST /sessions`. It holds the Anthropic key and meters
spend with per-tenant tokens + credits. Its own docs (`docs/explanation/`,
`docs/reference/`) are the authority on that side of the wire; this repo only
needs to know the request shapes the CLI sends. See
[enrichment-and-privacy](enrichment-and-privacy.md).

## underscore-ci — the orchestrator + renderer + ops

This repo. It owns:

| Area | Files | Doc |
|---|---|---|
| CI orchestration | `action.yml`, `entrypoint.sh`, `.github/workflows/` | [entrypoint-runtime](../reference/entrypoint-runtime.md) |
| Image build | `Dockerfile`, `scripts/build-image.sh` | [scripts-and-image](../reference/scripts-and-image.md) |
| Report renderer (fork) | `src/`, `vite.config.ts` | [the-report-renderer](the-report-renderer.md) |
| Publish/retire | `scripts/publish-report.sh`, `retire-report.sh` | [scripts-and-image](../reference/scripts-and-image.md) |
| Hosted viewer | `viewer/` | [deployment-viewer-and-app](../reference/deployment-viewer-and-app.md) |
| Onboarding App | `github-app/` | [deployment-viewer-and-app](../reference/deployment-viewer-and-app.md) |

## The seam that matters most: `pr-output.json`

The contract between the analysis (desktop-sourced backend) and the report
(this repo's renderer) is a single JSON file, **`pr-output.json`**, emitted by
the CLI and consumed by the renderer's boot loader. Its raw shape is mirrored in
`src/types/analysis.ts` (`RawAnalysisJSON`). If the backend changes that shape,
the renderer's `transformToFrontendFormat` (`src/lib/transform-data/index.ts`)
is where you reconcile it. This is the one place the two codebases meet at
runtime.
</content>

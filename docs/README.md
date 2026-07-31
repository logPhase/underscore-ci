# underscore-ci documentation

**Start here.** This is the map of the whole documentation set, organised by the [Diátaxis](https://diataxis.fr/) quadrants: explanation to understand, tutorials to learn, how-to to get a job done, reference to look up a fact. Scope: developing on underscore-ci itself. Non-scope: the client-facing quickstart for wiring the Action into a repo, which lives in the root [`README.md`](../README.md). Audience: maintainers and agents working in this repo.

## The 30-second orientation

| If you want to… | Go to |
|---|---|
| Understand what happens on a pull request | [system-overview](explanation/system-overview.md) |
| See it work end to end on your own machine | [first-analysis-end-to-end](tutorials/first-analysis-end-to-end.md) |
| Change what the report *looks like* | [develop-the-renderer](how-to/develop-the-renderer.md) → [renderer-architecture](reference/renderer-architecture.md) |
| Change what the analysis *does* | the backend lives in **underscore-desktop**, not here — [architecture-three-repos](explanation/architecture-three-repos.md) |
| Change the CI orchestration | [entrypoint-runtime](reference/entrypoint-runtime.md) + `entrypoint.sh` |
| Add or change an action input | [action-inputs-outputs](reference/action-inputs-outputs.md) |
| Ship a new image to clients | [build-and-push-the-image](how-to/build-and-push-the-image.md) |
| Answer "what data leaves our runner?" | [enrichment-and-privacy](explanation/enrichment-and-privacy.md) |
| Operate the viewer or the onboarding App | [deploy-the-viewer](how-to/deploy-the-viewer.md) → [deployment-viewer-and-app](reference/deployment-viewer-and-app.md) |

## What underscore-ci is, in one paragraph

On every pull request in a client's repository, a **GitHub Action** runs the Underscore analysis CLI *ephemerally on the client's own CI runner*. It diffs the PR against the repository's full call graph, finds the execution **journeys** the change touches, and publishes a self-contained **interactive HTML report** (journeys, method-level impact overlay, business-flow diagrams, chapter deep-dives). The client's code never leaves the runner unless they opt into **enrichment** or the **code review**, which route the diff and the changed method bodies through our hosted intent-drift-analyzer. This repo holds three deliverables: the Action pack (`action.yml`, `entrypoint.sh`, `Dockerfile`, `scripts/`), the report renderer (a React SPA under `src/`), and the ops glue (`viewer/`, `github-app/`).

## Explanation — understand the system

Read these first if you are new. They explain how the system works and why it is shaped this way.

- **[system-overview.md](explanation/system-overview.md)** — the flagship: a pull request becoming a report, narrated end to end. **Read this first.**
- **[architecture-three-repos.md](explanation/architecture-three-repos.md)** — how underscore-ci, underscore-desktop and intent-drift-analyzer divide the work, and the contracts between them.
- **[enrichment-and-privacy.md](explanation/enrichment-and-privacy.md)** — structural-only versus enriched, exactly what crosses the boundary, and why enrichment can never fail a pipeline.
- **[the-report-renderer.md](explanation/the-report-renderer.md)** — why the SPA is a fork, why HashRouter, and how one bundle boots as a report, a repo hub or a portal.

## Tutorials — learn by doing

- **[first-analysis-end-to-end.md](tutorials/first-analysis-end-to-end.md)** — from a fresh clone to a real report open in your browser.

## How-to guides — get a specific job done

- **[run-the-container-locally.md](how-to/run-the-container-locally.md)** — smoke-test the analysis image against a local repo, with no GitHub.
- **[develop-the-renderer.md](how-to/develop-the-renderer.md)** — `pnpm dev` against a payload you supply; where things live; the rules that bite.
- **[build-and-push-the-image.md](how-to/build-and-push-the-image.md)** — build and release the analysis image from a sibling desktop checkout.
- **[deploy-the-viewer.md](how-to/deploy-the-viewer.md)** — stand up the hosted viewer and the onboarding GitHub App.

## Reference — look up the exact facts

- **[action-inputs-outputs.md](reference/action-inputs-outputs.md)** — every `action.yml` input, output and env var, plus what the reusable workflow forwards.
- **[entrypoint-runtime.md](reference/entrypoint-runtime.md)** — every constant and env var in the container, the pr-versus-full branch table, staging, comments and failure posture.
- **[scripts-and-image.md](reference/scripts-and-image.md)** — each script (build-time versus CI-time) and every Dockerfile layer.
- **[renderer-architecture.md](reference/renderer-architecture.md)** — routes, stores, pages, domain types and the boot contract.
- **[deployment-viewer-and-app.md](reference/deployment-viewer-and-app.md)** — the viewer and GitHub App topology, and the reports-branch content contract.

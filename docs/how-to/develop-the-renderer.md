# How to develop the report renderer

The inner loop for changing what the report looks like — no Docker, no CI. Scope: commands, where things live, and the rules that will bite you. Non-scope: the architecture itself ([renderer-architecture](../reference/renderer-architecture.md)) and why it is shaped that way ([the-report-renderer](../explanation/the-report-renderer.md)). Audience: anyone editing `src/`.

## Setup needs a payload you have to supply

```bash
pnpm install          # Node >= 24 (package.json engines)
pnpm dev              # Vite dev server
```

A dev-only Vite middleware (`devPrOutputFixture` in `vite.config.ts`) answers any request ending in `/pr-output.json` from a fixture — by default `dev-runs/dev-fixture/pr-output.json`, overridable with `DEV_PR_OUTPUT`. **`dev-runs/` is gitignored and absent from a fresh clone**, because fixtures are real analysis exports and must never ship. So on a clean checkout the middleware has nothing to serve and the report boots into its load error.

Produce a payload first — run the container against a local repo ([run-the-container-locally](run-the-container-locally.md)) and keep its `pr-output.json` — then:

```bash
DEV_PR_OUTPUT=/path/to/pr-output.json pnpm dev
```

To work on the **repo hub** or the **portal** instead of a single report, serve a `repo-manifest.json` or a `viewers.json` next to the app: `boot()` probes them before the report payload.

## Commands

```bash
pnpm typecheck            # tsc over the app and node configs
pnpm test                 # vitest run — the ported suite must stay green
pnpm test:watch
pnpm build                # typecheck + vite build → report-dist/ (multi-file)
pnpm build:singlefile     # build + scripts/build-singlefile.mjs → the single-file template
pnpm preview              # serve the built report-dist/
```

## Where things live

| To change… | Edit |
|---|---|
| Boot, hub/portal probing, payload loading | `src/store/use-analysis-store.ts`, `src/pages/entry.tsx`, `src/lib/repo/` |
| The payload → UI transform | `src/lib/transform-data/index.ts` (**not** `src/data/transform-data.ts`) |
| A route | `src/App.tsx` plus a page in `src/pages/` |
| App state | a store in `src/store/` (see the store table in the reference) |
| The canvas | `src/components/canvas/` |
| The chapter reading surface | `src/components/journeys/` (`ChapterView`, `ExpandableFrame`, `CallFlowGraph`, `AskPanel`, diff and body panels) |
| Visual identity (the fork) | `src/index.css` tokens, `src/pages/journeys.tsx` |
| Domain types / the JSON contract | `src/types/` |

## Five rules that will bite you if ignored

1. **HashRouter and a relative base, always.** The report must work from `file://` and from hosted subpaths. Never introduce `BrowserRouter` or an absolute asset path; Vite `base` stays `"./"`.
2. **Never re-copy the desktop renderer.** `src/` is a fork; re-copying wipes the logPhase identity and every report-mode change. Port logic in selectively.
3. **Hide server-backed features, never mock them.** Ask is the only live one, gated by `askEndpointHref()`, and must render nothing in a `file://` artifact.
4. **Payload-gate new surfaces.** Specs and findings render only when their key is present and otherwise redirect to `/journeys`. A new AI-fed surface follows that pattern — absent key, no page.
5. **Check for importers before trusting a file.** The fork carries dead ports: `CallFlowChart.tsx` and the `BPMN_ASK_IPC` constant have none.

## Verifying a change

Drive the actual surface you changed in `pnpm dev`, then run `pnpm typecheck && pnpm test`. Finally `pnpm build:singlefile` and open the produced HTML from `file://`: the single-file path is what clients receive in artifact mode, and it is where inlining bugs (fonts, assets, routing) show up. `scripts/build-singlefile.mjs` throws on the known corruption classes, so a green build is meaningful evidence.

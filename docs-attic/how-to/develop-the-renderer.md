# How to: develop the report renderer

The inner loop for changing what the report *looks like* — no Docker, no CI.
Architecture: [the-report-renderer](../explanation/the-report-renderer.md) /
[renderer-architecture](../reference/renderer-architecture.md).

## Setup

```bash
pnpm install          # Node >= 24 (see package.json engines)
pnpm dev              # Vite dev server
```

`pnpm dev` boots the report against a **fixture**. A dev-only Vite middleware
(`vite.config.ts` → `devPrOutputFixture`) serves `dev-runs/dev-fixture/pr-output.json`
whenever the app requests `./pr-output.json`. The fixture lives **outside**
`public/` on purpose — production builds must ship an empty JSON slot the CI
action fills per PR, never a baked-in client export.

```bash
DEV_PR_OUTPUT=/path/to/other/pr-output.json pnpm dev   # point at a different payload
```

Generate a real payload to develop against by running the container locally
([run-the-container-locally](run-the-container-locally.md)) and copying its
`pr-output.json`.

## Commands

```bash
pnpm typecheck            # tsc on app + node configs
pnpm test                 # vitest run (the ported test suite must stay green)
pnpm test:watch
pnpm build                # typecheck + vite build → report-dist/ (multi-file)
pnpm build:singlefile     # build + build-singlefile.mjs → single-file template
pnpm preview              # serve the built report-dist/
```

## Where things live (quick map)

| To change… | Edit |
|---|---|
| Boot / payload loading | `src/store/use-analysis-store.ts`, `src/pages/report-loader.tsx` |
| The payload→UI transform | `src/lib/transform-data/index.ts` (**not** `src/data/transform-data.ts`) |
| A route | `src/App.tsx` + a page in `src/pages/` |
| App state | a store in `src/store/` (see the [store table](../reference/renderer-architecture.md)) |
| The canvas | `src/components/canvas/` (`BiologicalWorld`, panels, tooltips) |
| Journey/chapter reading surface | `src/components/journeys/` (`ChapterView`, `AskPanel`, diff/body panels) |
| Visual identity (the fork) | `src/index.css` (indigo/violet/cyan tokens), `src/pages/journeys.tsx` |
| Domain types / the JSON contract | `src/types/*.ts` |

## Rules that will bite you if ignored

1. **HashRouter only.** The report must work from `file://` and hosted subpaths.
   Never introduce BrowserRouter or absolute asset paths; Vite `base` stays `./`.
2. **Don't re-copy the desktop renderer.** `src/` is a **fork** — re-copying
   wipes the logPhase identity and the report-mode changes. Port desktop logic
   in selectively.
3. **KEEPOUTS: hide server-backed features, don't mock them.** Only **Ask** is
   live (hosted-viewer only, gated by `askEndpointHref()`). It must render
   nothing in a `file://` artifact.
4. **Payload-gate new surfaces.** Specs/findings/overview appear only if their
   key is present in `pr-output.json`. A new AI surface should follow the same
   pattern — absent key → the page/section simply doesn't render.
5. **Keep the ported tests green.** `pnpm test` before you consider a change done.

## Verifying a change

`pnpm dev` and drive the actual surface you changed, then `pnpm build:singlefile`
and open the produced single-file HTML from `file://` to confirm it survives the
inlining (fonts, assets, routing). The single-file path is what clients actually
receive in artifact mode.
</content>

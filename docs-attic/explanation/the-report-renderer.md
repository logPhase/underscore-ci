# The report renderer

`src/` is a React 19 + Vite + Zustand single-page app whose entire job is to
render **one** static analysis report from **one** JSON file. This explains how
it boots, the three constraints that shape every architectural choice, and the
one live feature that survives the strip-down. For the exhaustive route/store/
type listing, see [reference/renderer-architecture](../reference/renderer-architecture.md).

## It is a fork, not a copy

The renderer began as a verbatim copy of underscore-desktop's Electron renderer,
Electron-stripped. As of 2026-07-04 it is a **fork** (see
`docs/plans/2026-07-02-underscore-ci-implementation.md`): the logPhase visual
identity — indigo/violet/cyan tokens in `src/index.css`, the zinc→token remap,
the "traced-route" journey-card signature — lives here. **Never re-copy the
desktop renderer over `src/`; it would wipe this.** Port desktop logic changes
in selectively.

Because it is a fork, several ported artifacts still carry desktop fingerprints
you can ignore: `src/types/bpmn-ask.ts` references the old Electron IPC channel
in a comment; components like `BpmnEditor.tsx`, `CodePanel.tsx` exist but are
latent in the static build.

## Three constraints shape everything

1. **It runs from `file://`.** A reviewer downloads the artifact and
   double-clicks. There is no server. Consequences: **HashRouter** (all
   navigation is in the URL fragment — no server to rewrite deep links), a
   **relative Vite `base: "./"`** (`vite.config.ts`), and fonts bundled via
   `@fontsource` so they load offline.

2. **It also runs from a hosted subpath.** The viewer serves it under
   `…/reports/pr-<n>/`, and Pages under `pr-<n>/`. The same relative-base +
   hash-routing choices cover this — no base-path coupling.

3. **No live backend, with one exception.** Everything is baked into
   `pr-output.json` at CI time. The one network feature is **Ask** — see below.

## Boot flow

```
main.tsx  applyTheme → load fonts → render <App/>
   │
App.tsx   TooltipProvider + Toaster + PointerEventsGuard + HashRouter
   │
"/" → report-loader.tsx   if idle → loadReport();  on complete → <Navigate to="/journeys">
   │                       (12s watchdog surfaces a "Reload report" button)
   ▼
use-analysis-store.loadReport()
   │  fetchReportJson()  ── inline #underscore-report-data tag first, else fetch('./pr-output.json')
   │  transformToFrontendFormat(raw)   ← src/lib/transform-data/index.ts
   ▼  store transformedData; prMode = (prOverlay !== null)
```

### The inline-tag-vs-fetch fallback

`fetchReportJson()` reads the `<script id="underscore-report-data">` tag first.
In the **single-file artifact**, `inject-report-data.mjs` has already replaced
the `__UNDERSCORE_REPORT_DATA__` marker with the real JSON, so the tag parses.
In **dev** and the **multi-file Pages build** the marker is still raw, so it
falls back to `fetch('./pr-output.json')` (dev-served from a fixture by a Vite
middleware; see [develop-the-renderer](../how-to/develop-the-renderer.md)). This
is the marker contract with `scripts/inject-report-data.mjs`.

> **Gotcha:** the real transform is `src/lib/transform-data/index.ts`.
> `src/data/transform-data.ts` is a *same-named but unrelated* constants file
> (color palettes, validation sets). Easy to open the wrong one.

## What the report shows

Five surfaces, each a route, most payload-gated (they appear only if the
corresponding key is present in `pr-output.json`):

- **Journeys** (`/journeys`) — a "departures board" index; each journey is a
  lettered transit line of component stops, amber Δ chips on PR-touched stops,
  a badge for journeys with a real composed BPMN diagram.
- **Canvas** (`/canvas`) — the architecture map: an SVG "biological world" of
  services/files/methods with journey lines, code panels, and a method detail
  panel, built on React Flow.
- **Chapter** (`/journeys/:chapterSlug`) — the deep-dive reading surface for one
  journey: BPMN + code + Ask.
- **Specs** (`/specs`) — the repo's behavioral contract as living EARS specs
  with revision history and version diffs (written by the analyzer's synth
  agent, baked into the payload).
- **Findings** (`/findings`) — correctness-audit cards (divergence vs bug),
  evidence-first.

## The one live feature: Ask

**Ask AI** is the only non-static, network-dependent surface — and it is active
**only when the report is served from a hosted viewer over http(s)**.
`askEndpointHref()` (`src/lib/ask-endpoint.ts`) returns `null` unless the page
is at a `…/reports/<dir>/` or `…/latest/<dir>/` http(s) URL; it then derives the
viewer's `POST <root>/ask` relay, which injects analyzer auth **server-side** so
the browser never holds a token. `AskPanel.tsx` renders **nothing** in a
downloaded `file://` artifact — the dead affordance is never offered offline.
This is the desktop KEEPOUTS rule honored: hide server-backed features, don't
mock them.

Everything else — specs, findings, PR overview, journey knowledge — is **not**
server-backed. It is baked into the payload at CI time and merely payload-gated.
</content>

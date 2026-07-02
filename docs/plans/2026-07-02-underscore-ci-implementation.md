# underscore-ci — Implementation Plan

**Date:** 2026-07-02
**Status:** In progress
**Ported from:** `underscore-desktop/docs/plans/2026-07-02-ci-pr-report-design.md` (validated design)

## Goal

On every PR in a client's C#/.NET monorepo, a GitHub Action runs the Underscore
analysis CLI ephemerally on the CI runner and publishes an interactive static
web report (journeys, impact overlay, BPMN, chapter deep-dives) — nothing
installed, nothing hosted for viewing. Enrichment routes through the hosted
intent-drift analyzer; every monetization lever (tokens, credits, private
image) stays in our hands.

## Provenance

This repo is fully self-contained. The report renderer under `src/` was
**copied from the desktop app** at
`/Users/naveennegi/projects/logPhase/prototypes/underscore-desktop` at commit
**`1027cf1`** and stripped of all Electron code. The desktop repo is a
read-only source and is never modified by work here; renderer drift is
reconciled by re-copying, not by cross-repo imports.

The desktop KEEPOUTS rule still binds: server-backed features (AskPanel,
re-analyze, auth/workspace chrome) are **hidden** in the report — never mocked.

## Repo layout

```
underscore-ci/
  action.yml                 # container action: "Underscore PR Analysis"
  Dockerfile                 # eclipse-temurin:21-jre + git/jq/gh/node + .NET 10 SDK
  entrypoint.sh              # SHAs from event payload -> pr CLI -> report -> comment upsert
  scripts/
    build-image.sh           # stage uberjar + roslyn publish + report into .docker-context/, docker build
    inject-report-data.mjs   # inline pr-output.json into the singlefile HTML (marker contract)
  examples/
    underscore-pr.yml        # ~20-line client workflow (artifact default, pages variant commented)
  src/                       # copied renderer (report mode) — owned by the renderer track
  report-dist/               # pnpm build output (gitignored)
  .docker-context/           # staged image inputs (gitignored)
  docs/plans/                # this plan
```

## Components

### 1. Static report build (renderer track, `src/`)

- Boot: `fetch('./pr-output.json')` → `transformToFrontendFormat` → hydrate the
  zustand analysis store → land on the journeys page.
- HashRouter — must work on `file://` (artifact) and GitHub Pages subpaths.
- Routes kept: `/canvas`, `/journeys`, `/journeys/:chapterSlug`. Entry page,
  settings dialog, library, auth flows, and workspace rail are removed.
- Singlefile variant (`vite-plugin-singlefile`): one HTML with JS/CSS inlined
  and a JSON placeholder tag
  `<script type="application/json" id="underscore-report-data">__UNDERSCORE_REPORT_DATA__</script>`.
  The action replaces the marker per PR (`scripts/inject-report-data.mjs`);
  the boot loader prefers the inline tag and falls back to the fetch.
- The 6 copied test files / 18 vitest tests must keep passing.

### 2. Action pack (this track)

- **`action.yml`** — docker action, inputs `delivery` (artifact|pages, default
  artifact), `sln`, `lang` (default csharp), `fail-on-error` (default false);
  outputs `report-file`, `publish-dir`, `pr-number`. Dev builds use
  `image: Dockerfile`; release tags repoint to
  `docker://ghcr.io/logphase/underscore-ci:vX`.
- **`Dockerfile`** — `eclipse-temurin:21-jre`; git (worktrees), jq (event
  payload), gh (comment upsert), node (JSON inlining); .NET 10 SDK
  pre-installed at `/usr/share/dotnet` with `dotnet-install.sh` kept at
  `/usr/local/bin` for lazy per-repo SDK pins (`global.json`/TFMs);
  `UNDERSCORE_MODE=container`,
  `UNDERSCORE_ROSLYN_CLI=/opt/underscore/roslyn-cli/RoslynCli.dll` (DLL mode:
  `dotnet RoslynCli.dll <sln>` — no build step at runtime).
- **`entrypoint.sh`** —
  1. base/head/number/title/branch/body from `GITHUB_EVENT_PATH` (no API calls);
  2. `java -jar underscore-cli.jar pr $GITHUB_WORKSPACE --base <sha> --head <sha>
     --lang csharp [--sln <path>] --pr-title <t> --branch <b> -o out/pr-output.json`
     (requires `fetch-depth: 0`; the pipeline isolates base/head via `git worktree`);
  3. enrichment: `INTENT_DRIFT_TOKEN` present → `FLOW_ENABLED=1 FLOW_ANALYZER=1
     OVERVIEW_ENABLED=1`; absent → structural-only (pipeline soft-degrades);
  4. stage `report-dist/` + `pr-output.json` into `.underscore-report/`;
     artifact mode additionally inlines the JSON into
     `underscore-report.html`;
  5. `summary.md` from the run's `manifest.json` (written by the CLI next to
     the `-o` path: `prNumber`, `prTitle`, `counts{journeys,bpmn,summaries}`,
     `bpmnFlows[{journeyId,title}]`);
  6. upsert ONE PR comment keyed by `<!-- underscore-pr-report -->` via `gh api`;
  7. failure posture: post a "failed, see logs" comment and exit 0 unless
     `fail-on-error: true`.
- **`scripts/build-image.sh`** — from a sibling desktop checkout: backend
  uberjar (`clojure -T:build uber` → `backend/target/underscore-<v>.jar`),
  `dotnet publish` of `backend/tools/roslyn-cli`, `pnpm build` +
  `pnpm build:singlefile` here; stages everything into `.docker-context/` and
  builds `ghcr.io/logphase/underscore-ci:dev`.

### 3. Analyzer — ops only

Nothing to build. The hosted intent-drift analyzer already provides bearer
tokens (sha256-stored, TTL), per-tenant `repo_id` scoping, credit gating
(402), usage metering/ledger, and the `/sessions`, `/bpmn`, `/overview`,
`/journey-knowledge` endpoints the CLI calls. `ANTHROPIC_API_KEY` stays
server-side with us — it is **never** required in client CI.

Ops: deploy `docker-compose.prod.yml` + Caddy on a public TLS domain; create
the client account; issue a token + starting credits.

## Phased rollout

1. **Phase 1 — local demo.** `scripts/build-image.sh` against the sibling
   desktop checkout; run the container by hand against a local C# repo with a
   synthetic event payload; open the singlefile HTML. No GitHub needed.
2. **Phase 2 — dogfood PR.** Push the image to private GHCR; wire
   `examples/underscore-pr.yml` into one of our own C# repos; iterate on the
   comment/summary/report against real PRs. That workflow file becomes the
   client's.
3. **Phase 3 — client onboarding.** Host the analyzer publicly, issue the
   client token + credits, hand over the workflow + secrets + pull token.
   Start with **artifact delivery**; switch to Pages once their plan is
   confirmed (private Pages needs Enterprise Cloud). Pilot: one repo, one team.

Feedback instrumentation: the analyzer usage ledger shows whether/what runs
per PR; PR-comment reactions/replies show whether reviewers open reports.

## Client onboarding checklist

1. **Two secrets:** `INTENT_DRIFT_URL`, `INTENT_DRIFT_TOKEN` (we issue the
   token; omitting it degrades to structural-only — a deliberate privacy mode).
2. **GHCR pull token:** `UNDERSCORE_GHCR_USER` / `UNDERSCORE_GHCR_TOKEN`
   (read-only PAT scoped to the private image; revocable per client).
3. **One workflow file:** copy `examples/underscore-pr.yml` to
   `.github/workflows/`, keep `fetch-depth: 0`.
4. Repos with multiple solutions: set the `sln` input.
5. Disclosure: in enriched mode, PR diffs and changed method bodies flow to
   our analyzer (and on to Anthropic). Structural-only mode is one removed
   secret away.

## Monetization posture

- **We host the analyzer.** Tokens/credits/ledger only protect us while we
  control the Neo4j and the admin account; self-hosting in the client env
  would make metering decorative — that is a priced enterprise tier, later.
- **Credits** gate enrichment spend (`ensure_credits` → 402); the balance is
  the spend cap for the pilot — no rate limiting needed yet.
- **Private GHCR image** is the second lever: access is granted per client and
  revocable; versioned tags (`v1`, `v1.x.y`) control what clients run.

## Out of scope (YAGNI)

- Hosted viewer app / report auth layer
- In-client-env analyzer deployment (enterprise tier, later)
- Java/Python in the action (backend supports both — `--lang` is already
  plumbed through; bundle the sidecars when a client needs them)
- Report-mode AskPanel (needs a live backend; health-gated hidden per KEEPOUTS)

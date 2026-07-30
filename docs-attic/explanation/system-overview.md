# System overview — a PR becoming a report

This is the flagship explanation. Read it first. It narrates the one flow that
everything else in this repo serves: **a pull request opens → an interactive
report appears.** Every file reference is real; follow them as you read.

## The shape of the thing

underscore-ci is a **GitHub Action** plus the **static report** it publishes.
It does not host anything for the client and it does not run analysis on our
servers. The analysis runs *inside the client's CI runner*, in a container we
ship. The only thing that (optionally) reaches out to us is the AI enrichment.

```
 client's repo, on a pull_request
        │
        ▼
 .github/workflows/underscore.yml        (client copies examples/underscore.yml)
        │  uses: logPhase/underscore-ci/.github/workflows/underscore.yml@v2
        ▼
 reusable workflow (.github/workflows/underscore.yml in THIS repo)
        │  checkout fetch-depth:0  →  uses: logPhase/underscore-ci@v2
        ▼
 action.yml  (composite action, runs on the runner)
        │  docker login + pull + run   the analysis image
        ▼
 entrypoint.sh  (inside the container)
        │  1. resolve base/head SHAs from the event payload
        │  2. java -jar underscore-cli.jar pr <workspace> --base --head
        │  3. (opt-in) enrichment → hosted intent-drift-analyzer
        │  4. stage report-dist/ + pr-output.json → .underscore-report/
        │  5. artifact mode: inline the JSON into one underscore-report.html
        │  6. upsert ONE PR comment; post correctness findings review
        ▼
 back on the runner (action.yml composite steps)
        │  publish-report.sh → commit to the underscore-reports branch
        ▼
 hosted viewer (nginx + git-sync)  serves the branch → reviewers open the report
```

## Step by step

### 1. The client's one file

The client copies [`examples/underscore.yml`](../../examples/underscore.yml) to
their `.github/workflows/`. It is a ~10-line **caller** that triggers on
`[pull_request, workflow_dispatch]` and delegates everything to our reusable
workflow at `@v2`. Because they pin the tag, every improvement we ship reaches
them with no change on their side. (The onboarding GitHub App commits an
equivalent *action-form* caller instead — see
[enrichment-and-privacy](enrichment-and-privacy.md) and the app reference.)

### 2. The reusable workflow

[`.github/workflows/underscore.yml`](../../.github/workflows/underscore.yml) is
`on: workflow_call`. It does exactly two meaningful things: `actions/checkout@v4`
with **`fetch-depth: 0`** (the analysis diffs base against head via `git
worktree`, so it needs full history), then `uses: logPhase/underscore-ci@v2`
with `mode: auto` and `publish: branch`. Its job has `contents: write` +
`pull-requests: write` and per-PR concurrency with cancel-in-progress.

### 3. The composite action

[`action.yml`](../../action.yml) is a **composite** action, deliberately *not* a
`runs.using: docker` container action. Hosted runners pull container-action
images during "Set up job" — before any step can `docker login` — so a private
GHCR image would be unpullable (actions/runner#1919). Instead the action does
`docker login` + `docker pull` + `docker run` itself. Its steps:

1. **Pull analysis image** — logs into GHCR with the client's pull token, pulls
   `ghcr.io/logphase/underscore-ci:v2`.
2. **Run analysis** — resolves `mode: auto` to `pr` (on `pull_request`) or
   `full` (otherwise), derives `INTENT_DRIFT_REPO_ID` (defaults to the repo
   name — the per-repo analyzer scope) and `INTENT_DRIFT_WORKSPACE` (the org, or
   an override — groups repos for shared memory), then `docker run` recreating
   the mounts a container action would get (`/github/workspace`, the event
   payload, `GITHUB_OUTPUT`, `GITHUB_STEP_SUMMARY`).
3. **Publish report to reports branch** (`publish: branch`) — runs
   [`scripts/publish-report.sh`](../../scripts/publish-report.sh) on the runner.
4. **Retire stale report** — if the PR became infrastructure-only, runs
   [`scripts/retire-report.sh`](../../scripts/retire-report.sh).

### 4. Inside the container: `entrypoint.sh`

[`entrypoint.sh`](../../entrypoint.sh) is the heart. `set -euo pipefail`. Full
env-var and branch detail is in
[reference/entrypoint-runtime.md](../reference/entrypoint-runtime.md); the flow:

- **Mode & metadata.** Resolves `pr` vs `full`. In `pr` mode it reads
  `base.sha`, `head.sha`, `.number`, `.title`, `.head.ref` from
  `GITHUB_EVENT_PATH` with `jq` — **no API calls**. The PR body is written to a
  file and exported as `PR_DESCRIPTION_FILE` for the analyzer's retrieval.
- **Infra-only skip (pr only).** A three-dot merge-base diff
  (`git diff --name-only BASE...HEAD -- <src-glob>`) decides whether any source
  files for the language changed. If none did, it sets output `skipped=true`,
  writes one step-summary line, and `exit 0` cleanly — no comment, no red check.
- **Enrichment posture.** Gated on `INTENT_DRIFT_TOKEN`. Present → exports
  `FLOW_ENABLED=1 FLOW_ANALYZER=1` and, in `pr` mode, `OVERVIEW_ENABLED=1`
  (plus `FINDINGS_ENABLED=1` if `findings: on`); in `full` mode
  `FLOW_WORKBOOK_ENABLED=1` instead of the overview. Absent → structural-only,
  soft-degrades, never fails. See [enrichment-and-privacy](enrichment-and-privacy.md).
- **The analysis.** `java -jar underscore-cli.jar pr "$GITHUB_WORKSPACE" --base
  <sha> --head <sha> --lang csharp -o pr-output.json` (plus optional `--sln`,
  `--pr-title`, `--branch`). `full` mode uses the `analyze` verb over the whole
  repo. Both emit **`pr-output.json`** — the renderer's boot contract.
- **Staging.** Copies `report-dist/` (the built renderer, baked into the image)
  and `pr-output.json` into `.underscore-report/`. In **artifact** delivery it
  runs [`inject-report-data.mjs`](../../scripts/inject-report-data.mjs) to inline
  the JSON into a single `underscore-report.html`.
- **Comment & findings.** In `pr` mode it upserts **one** marker-keyed PR
  comment (`<!-- underscore-pr-report -->`) with a link to the report, and — if
  findings are enabled and present — posts a PR **review** with inline
  correctness comments anchored to changed lines. All best-effort: a `gh`
  hiccup after successful analysis never reddens the check.

### 5. Enrichment: the call to the analyzer

When enabled, the Clojure CLI (not the runner, not the browser) POSTs to the
hosted [intent-drift-analyzer](../../intent-drift-analyzer) at `INTENT_DRIFT_URL`:
`/sessions` to stage artifacts, then `/bpmn` (business-flow diagrams + living
EARS specs), `/overview` (PR narrative), `/summarize` (per-journey summaries),
and optionally `/review/correctness` (findings). The analyzer holds the
Anthropic key; **`ANTHROPIC_API_KEY` is never needed in client CI.** Read the
analyzer's own `docs/explanation/system-overview.md` for what happens on the
other side.

### 6. Publishing & the viewer

Back on the runner, [`publish-report.sh`](../../scripts/publish-report.sh)
commits the staged report to an orphan **`underscore-reports`** branch (a
per-PR dir `reports/pr-<N>/` for pr mode; a per-run dir + `latest/` for full
mode), maintains a `runs.json` index, and rewrites the branded landing page.
The hosted [`viewer/`](../../viewer) (nginx + a git-sync sidecar) serves that
branch, so a new commit appears with no redeploy. Reviewers open the report
either from the viewer URL, as a downloaded artifact (`file://`), or a GitHub
Pages `pr-<n>/` subpath — all three work because the renderer uses HashRouter
and relative asset paths. See
[the-report-renderer](the-report-renderer.md).

## What runs where — the mental model that prevents mistakes

| Concern | Where it runs | Why it matters |
|---|---|---|
| Call-graph analysis, diff, journeys | **client's CI runner**, in our image | code stays on the runner |
| The analysis *logic* (CLI + Roslyn) | source lives in **underscore-desktop** | not editable here — see [architecture](architecture-three-repos.md) |
| The report renderer | built here (`src/`), baked into the image | a *fork* of the desktop renderer |
| AI enrichment | **our hosted analyzer** | the only thing that leaves the runner, opt-in |
| Report hosting | **our viewer** (or artifact / Pages) | pure static; no analysis, no IP |

The single most common misconception: *"the analysis code is in this repo."*
It is not. This repo orchestrates the analysis and renders its output. The
analyzer (`underscore-cli.jar`, Roslyn sidecar) is *built from* a sibling
underscore-desktop checkout at image-build time.
</content>

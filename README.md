# Underscore PR Analysis — GitHub Action

On every pull request in your C#/.NET monorepo, Underscore analyzes the diff
against the full call graph and publishes an **interactive report**: which
execution journeys the PR touches, method-level impact overlays, business-flow
(BPMN) diagrams, and step-by-step chapter deep-dives. Analysis runs entirely
inside your CI runner — your code never leaves it unless you opt into
enrichment.

## Quickstart (clients)

1. Add the repository secrets:

   | Secret | Purpose |
   |---|---|
   | `INTENT_DRIFT_URL` | Hosted Underscore analyzer endpoint (we provide it) |
   | `INTENT_DRIFT_TOKEN` | Your analyzer bearer token (we issue it; omit for structural-only) |
   | `UNDERSCORE_GHCR_USER` / `UNDERSCORE_GHCR_TOKEN` | Pull auth for the private analysis image (the action logs in and pulls itself) |

2. Copy [`examples/underscore-pr.yml`](examples/underscore-pr.yml) to
   `.github/workflows/underscore-pr.yml`. The essentials:

   ```yaml
   on: pull_request
   permissions:
     contents: read
     pull-requests: write
   steps:
     - uses: actions/checkout@v4
       with:
         fetch-depth: 0        # required — analysis diffs base/head via git worktrees
     - id: underscore
       uses: logphase/underscore-ci@v1
       with:
         ghcr-username: ${{ secrets.UNDERSCORE_GHCR_USER }}
         ghcr-token: ${{ secrets.UNDERSCORE_GHCR_TOKEN }}
       env:
         GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
         INTENT_DRIFT_URL: ${{ secrets.INTENT_DRIFT_URL }}
         INTENT_DRIFT_TOKEN: ${{ secrets.INTENT_DRIFT_TOKEN }}
     - uses: actions/upload-artifact@v4
       if: steps.underscore.outputs.report-file != ''
       with:
         name: underscore-report
         path: ${{ steps.underscore.outputs.report-file }}
   ```

3. Open a PR. The action upserts one PR comment (edited on every push, never
   spammed) with a summary — journeys touched, business flows, and where to
   find the report.

### Inputs

| Input | Default | Meaning |
|---|---|---|
| `mode` | `pr` | `pr`: analyze the PR diff (needs a `pull_request` event). `full`: whole-repo report, works on `workflow_dispatch` — see [On-demand full-repo report](#on-demand-full-repo-report). |
| `delivery` | `artifact` | `artifact`: single-file HTML via the `report-file` output. `pages`: static dir via `publish-dir` for a Pages deploy step. |
| `sln` | auto-detect | Repo-relative `.sln`/`.slnx` path — required only when the repo has several solutions. |
| `lang` | `csharp` | `csharp` \| `java` \| `python` (C# is the supported bundle today). |
| `fail-on-error` | `false` | `true` fails the workflow on analysis errors. Default posture: post a "failed, see logs" comment and exit green — Underscore never blocks your pipeline. |
| `image` | `ghcr.io/logphase/underscore-ci:v1` | Analysis image to run — override for dev/dogfood builds (e.g. `:dev` from `scripts/build-image.sh`). |
| `ghcr-username` / `ghcr-token` | none | Pull auth for the private analysis image. Omit only when `image` is anonymously pullable. |

### Outputs

| Output | Meaning |
|---|---|
| `report-file` | Workspace-relative path to `underscore-report.html` (artifact mode) |
| `publish-dir` | Workspace-relative static report dir (pages mode) |
| `pr-number` | PR number the report was generated for |

## Delivery modes

**Artifact (default).** The action inlines the analysis JSON into a single
self-contained `underscore-report.html` (~6–8 MB) and hands the path to
`actions/upload-artifact`. Reviewers download it from the run's artifacts and
double-click — the full interactive UI works from `file://`. Works on every
GitHub plan.

**Pages.** Pass `delivery: pages` and add a deploy step
(`peaceiris/actions-gh-pages` with `keep_files: true`,
`destination_dir: pr-<number>`). Each PR gets a stable URL
`https://<owner>.github.io/<repo>/pr-<number>/`; a `pull_request: closed`
cleanup job prunes the folder (see the commented block in the example
workflow). Note: *private* Pages requires GitHub Enterprise Cloud — that is
why artifact is the default.

## On-demand full-repo report

Pass `mode: full` to get a whole-repo report (every journey and chapter — no
PR diff) from a manually dispatched workflow. Copy
[`examples/underscore-full.yml`](examples/underscore-full.yml) to
`.github/workflows/underscore-full.yml` and run it from the Actions tab.

- Runs on `workflow_dispatch` — no `pull_request` event or payload is needed,
  and no PR comment is posted (`pr-number` output stays empty).
- Report staging and delivery are identical to PR mode: the single-file HTML
  lands at the `report-file` output. The example workflow commits it to an
  orphan **`underscore-reports`** branch as
  `reports/<UTC timestamp>-run-<n>/underscore-report.html` plus a stable
  `latest/underscore-report.html` (needs `permissions: contents: write`).
- **Failure posture differs from PR mode:** in full mode an analysis failure
  always fails the step, regardless of `fail-on-error` — there is no PR to
  post a failure comment on, and a green no-op would be misleading for a
  manually dispatched run.
- `INTENT_DRIFT_URL` / `INTENT_DRIFT_TOKEN` remain optional — omit them for a
  structural-only report. In full mode enrichment now adds **BPMN business-flow
  diagrams** *and* **journey summaries** (`analyze!` runs the same PR-agnostic
  post-analysis enrichment `pr` does). The **PR-overview narrative** stays
  PR-mode-only — it is a PR-delta artifact and the analyzer `/overview`
  endpoint has no full-repo mode, so it is deliberately not produced here.
- **BPMN cost.** BPMN synthesis is one analyzer session over the repo's
  non-trivial journeys (a large repo can have ~40+). Set the optional
  **`BPMN_MAX_JOURNEYS`** env var (on the `uses` step) to cap it to the top-N
  journeys by step count; unset diagrams all discovered journeys. Trivial
  (≤3-step) and kitchen-sink dispatcher journeys are always skipped. Omit
  `INTENT_DRIFT_TOKEN` entirely to skip BPMN (and all) enrichment.
- **Hosted viewer (optional).** After deploying the static viewer (nginx
  serving the `underscore-reports` branch), set the repo **variable**
  `UNDERSCORE_VIEWER_URL` to its base URL. The example workflow then adds two
  links to the run's step summary: the per-run report
  (`<UNDERSCORE_VIEWER_URL>/reports/<stamp>-run-<n>/underscore-report.html`)
  and the report index (`<UNDERSCORE_VIEWER_URL>/`). Leave the variable unset
  to skip the links; the branch commit is unaffected either way.

## Structural-only vs enriched

| | Structural-only | Enriched |
|---|---|---|
| Requires | nothing (omit `INTENT_DRIFT_TOKEN`) | `INTENT_DRIFT_URL` + `INTENT_DRIFT_TOKEN` |
| Call graph, journeys, PR impact overlay, chapter deep-dives | yes | yes |
| Business-flow (BPMN) diagrams, PR overview narrative, journey knowledge | no | yes |
| Data leaving your runner | none | PR diff + changed method bodies go to the hosted analyzer (and on to Anthropic) |
| Cost | free compute on your runner | metered per-PR via analyzer credits |

The enriched column describes `mode: pr`; in `mode: full` enrichment adds BPMN
business-flow diagrams and journey summaries (but not the PR-overview
narrative) — see
[On-demand full-repo report](#on-demand-full-repo-report).

Enrichment soft-degrades: a missing/expired token or unreachable analyzer
never fails the run — you simply get the structural report. `ANTHROPIC_API_KEY`
is never needed in your CI; the model key lives on our analyzer.

## Report renderer (this repo's code)

Static web build of the Underscore PR report renderer, used by this action to
publish the interactive report (journeys, impact overlay, BPMN, chapter
deep-dives). The renderer is a stripped, Electron-free copy of the
`underscore-desktop` app: it boots by fetching `./pr-output.json` (emitted by
the Underscore analysis CLI), transforms it with `transformToFrontendFormat`,
hydrates the Zustand analysis store, and lands on the journeys page —
HashRouter throughout, so it works on `file://` artifacts and GitHub Pages
`pr-<n>/` subpaths alike. `pnpm dev` serves the report against the sample
fixture in `dev-runs/dev-fixture/pr-output.json` (dev-server-only middleware,
override with `DEV_PR_OUTPUT`); fixtures never live in `public/`, so builds
carry no baked-in analysis data. `pnpm build` emits `report-dist/`;
`pnpm build:singlefile` emits the one-file artifact variant (the CI action
injects the JSON as `<script type="application/json" id="pr-output">`).

## Building the image (maintainers)

The image is built from a sibling `underscore-desktop` checkout — the backend
CLI and Roslyn sidecar live there; the report renderer lives here (copied,
Electron-stripped).

```bash
# prerequisites: JDK 21+, Clojure CLI, .NET 10 SDK, pnpm, docker
./scripts/build-image.sh [path-to-underscore-desktop]   # or UNDERSCORE_DESKTOP_DIR
IMAGE_TAG=ghcr.io/logphase/underscore-ci:v1.0.0 ./scripts/build-image.sh
docker push ghcr.io/logphase/underscore-ci:v1.0.0
```

The script stages into `.docker-context/`:

- `underscore-cli.jar` — backend uberjar (`clojure -T:build uber`)
- `roslyn-cli/` — framework-dependent `dotnet publish` (run in-container as
  `dotnet RoslynCli.dll <sln>` via `UNDERSCORE_ROSLYN_CLI`)
- `report-dist/` — static report (`pnpm build`)
- `underscore-report.template.html` — singlefile build
  (`pnpm build:singlefile`) carrying the `__UNDERSCORE_REPORT_DATA__` marker
  that `scripts/inject-report-data.mjs` replaces per PR

`action.yml` is a **composite** action that does `docker login` + `docker pull`
+ `docker run` itself (defaulting to `ghcr.io/logphase/underscore-ci:v1`). It is
deliberately NOT a `runs.using: docker` container action: hosted runners pull
container-action images during "Set up job", before any workflow step can
authenticate, so a private GHCR image would be unpullable (actions/runner#1919).
For dev/dogfood, build and push a tag with `scripts/build-image.sh` and point
the `image` input at it (e.g. `image: ghcr.io/logphase/underscore-ci:dev`).

Local smoke test without GitHub:

```bash
cat > /tmp/event.json <<'EOF'
{"pull_request": {"number": 1, "title": "smoke", "base": {"sha": "<base-sha>"}, "head": {"sha": "<head-sha>", "ref": "feature"}}}
EOF
docker run --rm \
  -e GITHUB_WORKSPACE=/workspace -e GITHUB_EVENT_PATH=/tmp/event.json \
  -e GITHUB_REPOSITORY=you/repo -e GITHUB_RUN_ID=0 \
  -v /path/to/csharp-repo:/workspace -v /tmp/event.json:/tmp/event.json \
  ghcr.io/logphase/underscore-ci:dev
# report lands in /workspace/.underscore-report/underscore-report.html
```

## How it works

1. `actions/checkout` with `fetch-depth: 0` gives the runner full history.
2. The container resolves base/head SHAs from the PR event payload (no API
   calls) and runs
   `java -jar underscore-cli.jar pr $GITHUB_WORKSPACE --base <sha> --head <sha> --lang csharp -o pr-output.json`.
   The pipeline isolates base and head via `git worktree`, diffs the call
   graphs, and intersects the delta with discovered execution journeys.
3. With a token, BPMN flows / PR overview / journey knowledge are fetched from
   the hosted analyzer (`/sessions`, `/bpmn`, `/overview`).
4. The static report (HashRouter: `#/journeys`, `#/canvas`,
   `#/journeys/<chapter>`) is staged with the JSON; artifact mode inlines the
   JSON into one HTML file.
5. One marker-keyed PR comment (`<!-- underscore-pr-report -->`) is created or
   updated with the summary and report location.

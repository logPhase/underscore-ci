# Full-repo enrichment + hosted viewer — design

- Date: 2026-07-03
- Repos in scope: `underscore-desktop` (backend, `backend/src/underscore_cli/main.clj`) and `underscore-ci` (action / renderer / viewer). No other repo is touched.
- Non-goals: does not change the analysis IP boundary; does not move analysis into any cluster; does not introduce a public-Pages dependency.

## Problem

Three gaps block full-repo reports from being useful and reachable:

1. **Full mode is enrichment-poor.** `underscore analyze` (whole-repo, `MODE=full`) only ever runs the workbook path. In `analyze!` the *only* enrichment hook is `FLOW_WORKBOOK_ENABLED` (journey summaries). BPMN business flows and the PR overview narrative live exclusively in `pr!`, gated by `FLOW_ENABLED` / `FLOW_ANALYZER` / `OVERVIEW_ENABLED`. The CI entrypoint already documents this asymmetry: in full mode it sets `FLOW_WORKBOOK_ENABLED=1` and notes "BPMN/PR-overview enrichment is pr-mode-only". So a manually dispatched full-repo report shows journeys + summaries but no diagrams and no overview. The full-mode step summary even omits the BPMN column because `counts.bpmn` is always 0.

2. **BPMN/overview are structurally coupled to the PR diff.** `pr!` builds BPMN off `(:changed-files summary)` and base/head SHAs, and overview off the PR journeys. A whole-repo run has no diff — it needs a diff-independent journey set (all discovered journeys, not just touched ones) fed into the same `flow/diagram-stubs!` and `pr-overview/overview!` code.

3. **No hosted URL.** GitHub Pages is disabled at the `apcoa-tech` org, so the Pages delivery path is dead there. Reports currently reach a human only as a downloadable single-file artifact or via the `underscore-reports` orphan branch content — with nothing serving that branch over HTTP.

## Part 1 — Full enrichment in the backend

Port the BPMN and overview passes from `pr!` into `analyze!`, reusing the exact same functions and env gates so behavior and cost posture match PR mode.

### What moves into `analyze!`

- **BPMN**: after journeys are discovered/traced (`journey/trace-all-journeys`), run `flow/diagram-stubs!` over the journey set when `FLOW_ENABLED=1` (and `FLOW_ANALYZER=1` for the hosted-analyzer route). Full-repo has no `changed-files`; pass the full journey list instead of the PR-touched subset. The analyzer-session plumbing (`intent-drift/create-session!` + `stage-files!`) is reused so `/bpmn` gets a staged bundle rather than per-call uploads.
- **Overview**: after `render-data` is assembled (journeys + BPMN merged), run `pr-overview/overview!` when `OVERVIEW_ENABLED=1` (`pr-overview/enabled?`), assoc'd under `"prOverview"`. In full mode the "PR" framing degrades gracefully — no base/head diff, journeys come from the whole repo; title/description parts are omitted (nil) so the analyzer falls back to graph-context retrieval.
- **Workbook** stays as-is (already present, `FLOW_WORKBOOK_ENABLED`).

Gates are identical to PR mode — `FLOW_ENABLED`, `FLOW_ANALYZER`, `OVERVIEW_ENABLED`, `FLOW_WORKBOOK_ENABLED` — each a pass-through no-op when unset. Default-off so existing full runs aren't newly billed. The passes reuse the workbook/BPMN caching (source-hash keyed) so only changed journeys cost tokens.

### Cost cap — `BPMN_MAX_JOURNEYS`

BPMN diagramming is the expensive pass: one managed-agent session per journey. On a whole repo that is the *entire* journey set, not a handful of touched journeys — IRIS.VAS discovers ~47 journeys, i.e. ~47 agent sessions in a single full run.

Add `BPMN_MAX_JOURNEYS` (integer; unset ⇒ no cap) read in `analyze!` before the BPMN pass. Journeys beyond the cap are passed through un-diagrammed (structural only), ranked so the highest-importance journeys get diagrams first. This bounds the worst case deterministically regardless of repo size. It applies in `analyze!`; PR mode is naturally bounded by the diff and does not need it (may be added there later for symmetry).

### CI entrypoint

`entrypoint.sh` currently sets only `FLOW_WORKBOOK_ENABLED=1` in the `MODE=full` + `INTENT_DRIFT_TOKEN` branch. Extend that branch to also export `FLOW_ENABLED=1 FLOW_ANALYZER=1 OVERVIEW_ENABLED=1` (matching the pr-mode branch), plus pass through `BPMN_MAX_JOURNEYS` (a configurable input/env, defaulted conservatively for CI). Update the full-mode step-summary block to include a Business-flows (BPMN) column now that `counts.bpmn` can be non-zero, and to list `bpmnFlows[].title` as pr mode does. Structural-only degradation (no `INTENT_DRIFT_TOKEN`) is unchanged.

### Ship

Rebuild and repush the **private analysis image** (contains the Clojure/Roslyn engine + the CLI). This is the heavy image; per project rules it is rebuilt/pushed by the maintainer after the backend port lands.

## Part 2 — Hosted viewer

The renderer is already an Electron-stripped, self-contained web app (`underscore-ci/src`). Each CI run produces a single-file `underscore-report.html` whose payload is **analysis output only** (journeys, flows, overview text, scores) — no analysis engine, no Roslyn, no Clojure. That single file (plus `index.html` and `latest/`) is committed to the `underscore-reports` orphan branch of `apcoa-tech/iris-vas` at `reports/<stamp>/underscore-report.html`.

### Serving model

The viewer is a **pure static web server** — no backend, no IP:

- **nginx** container serving a document root.
- **git-sync sidecar** that continuously pulls the `underscore-reports` branch into a shared volume; nginx serves that volume. New runs land as new commits on the branch and appear without redeploying the viewer.
- Deployed to **APCOA AKS**. Because the served content is only the frontend bundle + committed report output, nothing IP-bearing ever enters the cluster.

Only the (fast) viewer image is built/pushed as part of this work — never the heavy analysis image. The viewer image is `nginx + static renderer assets`; git-sync pulls the reports at runtime.

### Run → link wiring

Each run's GitHub step summary links to:

```
<VIEWER_URL>/reports/<stamp>/underscore-report.html
```

`VIEWER_URL` is a **configurable repo variable**, set *after* the viewer is deployed and its ingress hostname is known. When `VIEWER_URL` is unset the summary falls back to the existing artifact/branch wording (no hard dependency on the viewer being live). `latest/` gives a stable "most recent report" entry point independent of `<stamp>`.

## Threat / IP model

The analysis engine is the IP; the report is disclosable output. The split is enforced by *where each artifact runs*:

| Artifact | Contains IP? | Where it runs | APCOA cluster operator can see it? |
|---|---|---|---|
| Analysis engine (Clojure + Roslyn, `underscore-cli.jar`) | Yes | Private CI image, ephemeral in GitHub Actions | **No** — never enters the cluster |
| Renderer / frontend bundle | No (render logic only) | Viewer nginx in AKS | Yes |
| Report output (`underscore-report.html`, journeys/flows/overview) | No (analysis *results* only) | Committed to `underscore-reports`, served by viewer | Yes |

An APCOA AKS operator with full cluster access can read the nginx pod, the git-sync volume, the `underscore-reports` branch contents, and every rendered report. They **cannot** obtain the analysis engine, the Roslyn integration, journey-discovery/importance algorithms, or the CLI — none of those are ever deployed to AKS; they exist only in the private CI image pulled inside ephemeral GitHub-hosted runners. Compromising the cluster yields reports, not the analyzer.

Secrets posture: `INTENT_DRIFT_TOKEN` / analyzer credentials live only in CI, never in the cluster. The viewer needs only read access to the `underscore-reports` branch (git-sync deploy key / token), which grants nothing beyond already-published output.

## Cost note

Full-repo BPMN is the dominant cost: one managed-agent session per journey, run over the *whole* journey set (~47 for IRIS.VAS) rather than a diff-scoped subset. Two bounds contain it:

1. **`BPMN_MAX_JOURNEYS`** — hard per-run cap on how many journeys get an agent session (importance-ranked); the rest degrade to structural-only.
2. **Analyzer `DAILY_CREDIT_CAP`** — the backstop: even with a generous per-run cap, the hosted analyzer stops spending once the daily credit ceiling is hit, so a burst of full-run dispatches can't run away.

Caching (source-hash keyed workbook/BPMN entries) further limits repeat cost: re-running full analysis only re-bills journeys whose entry/step bodies changed.

## Rollout order

1. **Backend port** — add BPMN + overview passes and `BPMN_MAX_JOURNEYS` to `analyze!` in `underscore-desktop` `backend/src/underscore_cli/main.clj`, behind the existing gates.
2. **Rebuild the private analysis image** (maintainer) — the heavy image; embeds the updated CLI.
3. **Entrypoint flags** — extend `underscore-ci/entrypoint.sh` full-mode branch to set `FLOW_ENABLED`/`FLOW_ANALYZER`/`OVERVIEW_ENABLED` (+ pass `BPMN_MAX_JOURNEYS`) and update the full-mode step summary.
4. **Build + push the (fast) viewer image** — nginx + renderer assets; git-sync sidecar config.
5. **Deploy the viewer to AKS** (APCOA operator) — obtain the ingress hostname.
6. **Set `VIEWER_URL`** repo variable to the deployed hostname.
7. **Dispatch a full run** — verify the step summary links resolve to `<VIEWER_URL>/reports/<stamp>/underscore-report.html` and that BPMN/overview now render in the full-repo report.

## Open questions

- Journey ranking for `BPMN_MAX_JOURNEYS` — reuse `importance/composite-importance` ordering (preferred) vs. entry-point order.
- Whether the full-mode overview needs a distinct prompt framing given there is no PR diff, or whether the existing graph-context fallback is sufficient.
- git-sync interval / branch-history growth on `underscore-reports` (retention/pruning of old `reports/<stamp>/`).

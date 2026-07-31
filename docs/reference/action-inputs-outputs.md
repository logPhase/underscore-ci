# Reference — action inputs, outputs and env

The complete surface of [`action.yml`](../../action.yml) and of the reusable workflow that wraps it. Scope: what a caller can set and read. Non-scope: what happens inside the container ([entrypoint-runtime](entrypoint-runtime.md)) and why the design is shaped this way ([system-overview](../explanation/system-overview.md)). Audience: anyone wiring the action into a workflow.

## Inputs

| Input | Default | Meaning |
|---|---|---|
| `mode` | `auto` | `auto` → `pr` on a `pull_request` event, else `full`. `pr` analyzes the diff and posts a PR comment. `full` produces a whole-repo report; an analysis failure **always** fails the step. |
| `publish` | `none` | `none` exposes the `report-file`/`publish-dir` outputs and nothing else. `branch` commits the report to `reports-branch`, maintains `runs.json` and `repo-manifest.json`, and writes the landing page. |
| `reports-branch` | `underscore-reports` | Orphan branch the `branch` publish mode commits to. |
| `findings` | `off` | `on` runs the correctness-findings agent (per-PR ledger, inline review comments) in `pr` mode when `INTENT_DRIFT_TOKEN` is set. `off` spends nothing. |
| `enrichment` | `on` | `off` gives a structural-only report — no BPMN, PR overview, journey knowledge, specs, grouping or architecture. One switch for all of them; several are CLI-driven and have no individual gate. Independent of `review`. |
| `review` | `off` | `on` runs the general code review — the raw PR diff reviewed on its own terms, posted as ONE PR comment — in `pr` mode when `INTENT_DRIFT_TOKEN` is set. Costs one agent run per unique diff. |
| `reports-repo` | `''` | Optional dedicated reports repository (`owner/name`). With `reports-deploy-key`, reports push there instead of to a branch of the analyzed repo. One reports repo can serve a whole platform — use the source repo's name as `reports-branch`. |
| `reports-deploy-key` | `''` | SSH private key (a deploy key) with write access to `reports-repo`. Required only when `reports-repo` is set. |
| `workspace` | `''` | Workspace/domain name grouping repos for shared cross-repo context. Defaults to the GitHub org, so an org's repos group together; override to curate domains. |
| `viewer-url` | `''` | Base URL of the hosted viewer (e.g. `https://host/underscore`). When set, the PR comment and step summary link the report there. |
| `delivery` | `artifact` | `artifact` emits a single-file HTML via the `report-file` output. `pages` leaves a static dir (`publish-dir`) for a Pages deploy step under `pr-<number>/`. |
| `sln` | `''` | Repo-relative `.sln`/`.slnx` path. Needed only when the repository holds more than one solution. |
| `lang` | `csharp` | `csharp` \| `java` \| `python` \| `kotlin`. |
| `fail-on-error` | `false` | `true` fails the workflow on an analysis error. Default posts a "failed, see logs" comment and exits green. |
| `image` | `ghcr.io/logphase/underscore-ci:v2` | Analysis image to run. Override for dev/dogfood builds (e.g. `:dev` from `scripts/build-image.sh`). |
| `ghcr-username` | `''` | Username for `ghcr.io` pull auth; any non-empty value works with a PAT-style pull token. Falls back to `x-access-token`. |
| `ghcr-token` | `''` | Pull token for the private analysis image. Omit only when `image` is anonymously pullable — with no token the action skips `docker login` entirely. |

## Outputs

| Output | Meaning |
|---|---|
| `skipped` | `true` when the PR changed no source files for `lang` (an infrastructure-only PR) and analysis was skipped cleanly; empty otherwise. |
| `report-file` | Workspace-relative path to `.underscore-report/underscore-report.html`. Empty in `pages` delivery. |
| `publish-dir` | Workspace-relative static report dir, `.underscore-report`. Feed it to a Pages deploy step with `destination_dir: pr-<number>/`. |
| `pr-number` | The pull request number the report was generated for; empty in `full` mode. |

## Env read by the action (secrets and config, not inputs)

These are inherited from the calling step's `env:` block and forwarded into the container by name.

| Env | Purpose |
|---|---|
| `INTENT_DRIFT_URL` | Hosted analyzer base URL. Trailing slashes are stripped inside the container. |
| `INTENT_DRIFT_TOKEN` | Analyzer bearer token. Absent → structural-only, and the general review skips with a warning. |
| `INTENT_DRIFT_REPO_ID` | Overrides the per-repo analyzer scope. Defaults to the repository name — without it the CLI would derive the scope from the checkout dir name and every repo would collide into one `workspace` scope. |
| `INTENT_DRIFT_WORKSPACE` | Overrides the workspace/domain. Defaults to the `workspace` input, then the GitHub org. |
| `BPMN_MAX_JOURNEYS` | Optional cost cap on BPMN synthesis (top-N journeys by step count), used in full mode. |
| `GITHUB_TOKEN` / `GH_TOKEN` | Comment upsert, findings review, and `gh pr view` during publish. |

## The reusable workflow forwards a narrower set

[`.github/workflows/underscore.yml`](../../.github/workflows/underscore.yml) (`on: workflow_call`) accepts only `viewer-url`, `sln`, `lang`, `reports-branch`, `workspace`, `enrichment`, `review`, plus the optional secrets `INTENT_DRIFT_URL` and `INTENT_DRIFT_TOKEN`. It pins `mode: auto` and `publish: branch`, and forwards `GITHUB_TOKEN` to the action step.

It does **not** expose `image`, `findings`, `delivery`, `fail-on-error`, `reports-repo` or `reports-deploy-key`. A caller who needs any of those calls the action directly (`uses: logPhase/underscore-ci@v2`), which is also the form the onboarding GitHub App commits.

Its job declares `contents: write` + `pull-requests: write`, checks out with `fetch-depth: 0`, and serializes runs with `concurrency.group: underscore-<pr number or ref>` — cancelling in progress only for `pull_request` events, so a dispatched full-repo run is never cancelled by the next one.

## Composite steps, in order

1. **Pull analysis image** — `docker login ghcr.io` when `ghcr-token` is non-empty, then `docker pull "$UNDERSCORE_IMAGE"`.
2. **Run Underscore PR analysis** (`id: analyze`) — resolves `auto` to `pr`/`full` on the runner so any image, including older ones, receives a concrete mode; exports `INTENT_DRIFT_REPO_ID` and `INTENT_DRIFT_WORKSPACE`; `docker run --rm` with `/github/workspace`, the event payload (read-only), `GITHUB_OUTPUT` and `GITHUB_STEP_SUMMARY` mounted, recreating what a container action would have received.
3. **Publish report to reports branch** — `if: inputs.publish == 'branch' && steps.analyze.outputs.report-file != ''`; runs `scripts/publish-report.sh` with all GitHub context passed through `env:` (an attacker-set PR title can never reach a shell).
4. **Retire stale report for infra-only PR** — `if: inputs.publish == 'branch' && steps.analyze.outputs.skipped == 'true'`; runs `scripts/retire-report.sh`.

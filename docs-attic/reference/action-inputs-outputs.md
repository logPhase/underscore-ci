# Reference — action inputs & outputs

The complete surface of [`action.yml`](../../action.yml). For the narrative of
how these flow, see [system-overview](../explanation/system-overview.md). The
action is a **composite** action (`runs.using: composite`), not a container
action — see the note in `action.yml` and
[system-overview §3](../explanation/system-overview.md).

## Inputs

| Input | Default | Meaning |
|---|---|---|
| `mode` | `auto` | `auto` → `pr` on a `pull_request` event, else `full`. `pr`: analyze the diff, post a PR comment. `full`: whole-repo report; an analysis failure **always** fails the step (no PR to comment on). |
| `publish` | `none` | `none`: just expose `report-file`/`publish-dir`. `branch`: commit the report to `reports-branch`, maintain `runs.json`, drop the landing page. |
| `reports-branch` | `underscore-reports` | Orphan branch the `branch` publish mode commits to. |
| `findings` | `off` | `on`: run the correctness-findings agent in `pr` mode when `INTENT_DRIFT_TOKEN` is set (per-PR ledger, inline review comments). `off`: zero agent spend. |
| `reports-repo` | `''` | Optional dedicated reports repo (`owner/name`). With `reports-deploy-key`, reports push **there** instead of a branch of the analyzed repo — keeps report data out of the code repo. One reports repo can serve a whole platform (use the source repo name as `reports-branch`). |
| `reports-deploy-key` | `''` | SSH private key (deploy key) with write access to `reports-repo`. Required only when `reports-repo` is set. |
| `workspace` | `''` | Domain name grouping repos for shared cross-repo memory + knowledge scope. Defaults to the GitHub org, so all repos in an org group together; override to curate domains. |
| `viewer-url` | `''` | Base URL of the hosted viewer (e.g. `https://host/underscore`). When set, each run's summary/comment links to its report there. |
| `delivery` | `artifact` | `artifact`: single-file HTML via `report-file`. `pages`: static dir via `publish-dir` for a Pages deploy step under `pr-<number>/`. |
| `sln` | auto-detect | Repo-relative `.sln`/`.slnx` path. Needed only when the repo has several solutions. |
| `lang` | `csharp` | `csharp` \| `java` \| `python` (C# is the shipped bundle today). |
| `fail-on-error` | `false` | `true` fails the workflow on analysis errors. Default: post a "failed, see logs" comment and exit green. |
| `image` | `ghcr.io/logphase/underscore-ci:v2` | Analysis image to run. Override for dev/dogfood (`:dev` from `scripts/build-image.sh`). |
| `ghcr-username` | `''` | Username for GHCR pull auth. Any non-empty value works with a PAT-style pull token. |
| `ghcr-token` | `''` | Pull token for the private image. Omit only if `image` is anonymously pullable. |

## Outputs

| Output | Meaning |
|---|---|
| `skipped` | `true` when the PR changed no source files for `lang` (infra-only) and analysis was skipped cleanly; empty otherwise. |
| `report-file` | Workspace-relative path to `.underscore-report/underscore-report.html` (artifact mode; empty in pages mode). |
| `publish-dir` | Workspace-relative static report dir `.underscore-report` (feed to a Pages deploy step with `destination_dir: pr-<number>/`). |
| `pr-number` | The PR number the report was generated for. |

## Env vars read (not inputs)

These are inherited from the calling step's `env:` block and passed through by
name — they are secrets/config, not action inputs:

| Env | Purpose |
|---|---|
| `INTENT_DRIFT_URL` | Hosted analyzer endpoint. Enables enrichment when paired with a token. |
| `INTENT_DRIFT_TOKEN` | Analyzer bearer token. Absent → structural-only. |
| `INTENT_DRIFT_REPO_ID` | Override the per-repo analyzer scope (defaults to the repo name). |
| `INTENT_DRIFT_WORKSPACE` | Override the workspace/domain (defaults to `workspace` input, then the org). |
| `BPMN_MAX_JOURNEYS` | Optional full-mode cost cap on BPMN synthesis. |
| `GITHUB_TOKEN` / `GH_TOKEN` | Comment upsert + findings review. |

## Composite steps

1. **Pull analysis image** — `docker login` (if `ghcr-token`) + `docker pull`.
2. **Run Underscore PR analysis** (`id: analyze`) — resolves `auto`, derives
   `INTENT_DRIFT_REPO_ID`/`INTENT_DRIFT_WORKSPACE`, `docker run` with the
   workspace/event/output mounts.
3. **Publish report to reports branch** — `if publish == 'branch' &&
   report-file != ''` → `scripts/publish-report.sh`.
4. **Retire stale report for infra-only PR** — `if publish == 'branch' &&
   skipped == 'true'` → `scripts/retire-report.sh`.
</content>

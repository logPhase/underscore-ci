# Reference — entrypoint runtime

Everything [`entrypoint.sh`](../../entrypoint.sh) reads and does inside the analysis container. Scope: constants, env, the `pr`/`full` branch table, and each best-effort side effect. Non-scope: the action surface around it ([action-inputs-outputs](action-inputs-outputs.md)) and the narrative ([system-overview](../explanation/system-overview.md)). Audience: anyone debugging a CI run or changing the container's behavior.

## Constants and environment

| Name | Value / source | Notes |
|---|---|---|
| `MODE` | env, default `auto` | `auto` → `pr` on `pull_request`, else `full`; anything but `pr`/`full` is a hard failure |
| `DELIVERY` | env, default `artifact` | `artifact` inlines the JSON into one HTML; anything else stages the static dir only |
| `SLN` | env | repo-relative solution path — must stay relative, it is resolved inside each git worktree |
| `UNDERSCORE_LANG` | env, default `csharp` | selects the source glob and the CLI `--lang` |
| `FAIL_ON_ERROR` | env, default `false` | honored in `pr` mode only |
| `ENRICHMENT` | env, default `on` | `off` unsets `INTENT_DRIFT_TOKEN` for the analysis step only |
| `REVIEW` | env, default `off` | `on` requests the general code review |
| `FINDINGS` | env, default `off` | `on` sets `FINDINGS_ENABLED` in pr mode |
| `UNDERSCORE_HOME` | `/opt/underscore` | where the image bakes the jar, parsers, `report-dist/`, the singlefile template |
| `COMMENT_MARKER` | `<!-- underscore-pr-report -->` | keys the single upserted report comment |
| `REVIEW_MARKER` | `<!-- underscore-code-review -->` | keys the separate code-review comment |
| `FINDING_MARKER` | `<!-- underscore-finding -->` | tags inline findings review comments |
| `OUT_DIR` | `/tmp/underscore/out` | the CLI `-o` target |
| `PUBLISH_DIR` | `$GITHUB_WORKSPACE/.underscore-report` | staged report; both outputs point here |
| `RUN_URL` | `$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID` | linked from comments |
| `PR_DESCRIPTION_FILE` | `/tmp/underscore/pr-description.md` | the file is written unconditionally; the var is exported only when non-empty |
| `UNDERSCORE_WWW_DIR` | `/tmp/underscore/www` | **full mode only** — keeps the CLI's www sync out of the client workspace |

`git config --global --add safe.directory '*'` runs early: the workspace is mounted with a different owner than the container user.

### Enrichment env exported for the CLI

| Env | When set |
|---|---|
| `FLOW_ENABLED=1`, `FLOW_ANALYZER=1` | token present, both modes |
| `ARCHITECTURE_ENABLED=1` | token present, both modes |
| `OVERVIEW_ENABLED=1` | token present **and** `pr` mode |
| `FLOW_WORKBOOK_ENABLED=1` | token present **and** `full` mode |
| `FINDINGS_ENABLED=1` | token present, `pr` mode, `FINDINGS=on` |
| `BPMN_MAX_JOURNEYS` | never re-exported — read straight from the container env |

`INTENT_DRIFT_URL` is stripped of every trailing slash and re-exported before any of this, so the CLI inherits the cleaned value.

## Execution order matters more than the individual steps

1. Resolve `MODE`; validate it.
2. `pr` mode only: read `base.sha`, `head.sha`, `.number`, `.title`, `.head.ref` from `GITHUB_EVENT_PATH` with `jq`; set the `pr-number` output; write the PR body to `PR_DESCRIPTION_FILE`.
3. Normalize `INTENT_DRIFT_URL`.
4. **`post_general_review`** — before any skip, before the CLI. It needs only the checkout and the parsed payload, so it still runs when the PR has no source changes and when the analysis later fails. One call site, so a review can never be billed twice.
5. **Source-less-PR skip** (`pr` only): `git diff --name-only BASE...HEAD -- <glob>`; nothing → `skipped=true`, one step-summary line, `exit 0`.
6. Enrichment posture (the table above).
7. The CLI run, then `on_analysis_failure` on a nonzero exit *or* an empty output.
8. Staging, delivery, comment, findings review, step summary.

## `pr` versus `full`

| Step | `pr` | `full` |
|---|---|---|
| PR metadata from the event payload | yes, via `jq`, no API calls | no — dispatch-driven |
| General code review | yes (`review: on`) | no |
| Source-less skip | yes → `skipped=true`, exit 0 | no |
| CLI verb | `pr <ws> --base <sha> --head <sha>` | `analyze <ws>` |
| `OVERVIEW_ENABLED` | yes, with a token | no, deliberately |
| `FLOW_WORKBOOK_ENABLED` | no | yes, with a token |
| `UNDERSCORE_WWW_DIR` | not set | set to `/tmp/underscore/www` |
| PR comment upsert | yes | no — step summary only |
| Findings review | yes, when the payload has findings | no |
| Failure posture | comment, then honor `FAIL_ON_ERROR` | **always fail the step** |

## The source glob

`java` → `*.java`, `python` → `*.py`, `kotlin` → `*.kt`, anything else → `*.cs`. The skip uses a three-dot merge-base diff so only the PR's own changes count; a two-dot diff would leak unrelated upstream commits the moment the base branch moves.

## CLI invocation

**pr:**

```
java -jar /opt/underscore/underscore-cli.jar pr "$GITHUB_WORKSPACE" \
  --base "$BASE_SHA" --head "$HEAD_SHA" --lang "$UNDERSCORE_LANG" \
  -o /tmp/underscore/out/pr-output.json \
  [--sln <repo-relative path>] [--pr-title <title>] [--branch <head ref>]
```

**full:**

```
UNDERSCORE_WWW_DIR=/tmp/underscore/www \
java -jar /opt/underscore/underscore-cli.jar analyze "$GITHUB_WORKSPACE" \
  --lang "$UNDERSCORE_LANG" -o /tmp/underscore/out/pr-output.json [--sln <path>]
```

Both must emit `pr-output.json` — that filename is the renderer's boot contract, so the full-repo output keeps it too.

## Staging and outputs

1. Copy `$UNDERSCORE_HOME/report-dist/.`, `pr-output.json`, `manifest.json` (when present) and `underscore-report.template.html` → `underscore-hub.html` into `.underscore-report/`.
2. `artifact` delivery only: `node inject-report-data.mjs <template> <pr-output.json> <underscore-report.html>`, then set the `report-file` output.
3. Always set the `publish-dir` output.

`underscore-hub.html` is the same bundle with **no** payload inlined; the publish step uses it as the reports-branch root `index.html`, where it boots hub mode from `repo-manifest.json`.

`manifest.json` is written by the CLI next to `-o`: `pr` runs carry `prNumber`/`prTitle`; `analyze` runs carry `project`, `counts` and `bpmnFlows`.

## The general code review (`post_general_review`)

Preconditions, each logging its own reason when it fails: `pr` mode, `REVIEW=on`, `INTENT_DRIFT_TOKEN` set, a PR number in the payload, a non-empty three-dot diff, and a diff under 4,000,000 bytes (the endpoint 422s past that and the service is single-worker, so an oversize monorepo diff must never be sent). The request is `POST $INTENT_DRIFT_URL/review/general` with a bearer token, `--max-time 900`, carrying `repo_id`, `pr_number`, `pr_title`, `pr_description` and `diff`.

Responses: `503` (reviewer not configured) and `402` (out of credits) get their own warnings; any other non-2xx logs the code and the first 200 bytes. A body with `reviewed: false` means the diff denoised to nothing service-side, so **no comment is posted** — the "no issues found" line would be a lie. The check is `if .reviewed == false`, not `.reviewed // true`, because jq's `//` also falls back on `false` and would swallow exactly this case. Otherwise the items render into one comment keyed by `REVIEW_MARKER`, in the order the service returned them (already high → medium → low), with a cached-run note when `.cached` is true.

## PR comment and findings review

- **`upsert_comment <file> [marker]`** — uses `GH_TOKEN`, falling back to `GITHUB_TOKEN`; absent → warn and return 0. Finds an existing comment containing the marker via a paginated `gh api repos/…/issues/<N>/comments`, then PATCHes it, else POSTs a new one. Every failure warns and returns 0. The default marker is `COMMENT_MARKER`; the code review passes its own so the two comments never clobber each other.
- **Comment link form** — `VIEWER_URL` set → `<viewer>/reports/pr-<N>/underscore-report.html` plus an all-sessions link; else `artifact` delivery → "download **underscore-report** from this run's artifacts"; else Pages → `https://<owner>.github.io/<repo>/pr-<N>/`. The comment is deliberately links only; counts and findings go to the step summary.
- **`post_findings_review`** — no-op unless a PR number exists, `pr-output.json` is non-empty and `.findings.items` is non-empty. It deletes the previous run's marker-tagged inline comments, anchors each open finding by grepping the first line of its excerpt in the file at HEAD (skipping any that will not anchor), and POSTs one review (`event: COMMENT`, `commit_id` = head SHA). If that 422s — an anchor outside the diff rejects the whole review — it retries body-only. Resolved findings ride along struck through.

## Failure posture (`on_analysis_failure`)

- **full**: always `::error::` and exit 1, regardless of `FAIL_ON_ERROR`. There is no PR to comment on and a green no-op would misrepresent a dispatched run.
- **pr**: upsert a "failed, see logs" comment linking `RUN_URL`; then fail if `FAIL_ON_ERROR=true`, otherwise `::warning::` and exit 0.

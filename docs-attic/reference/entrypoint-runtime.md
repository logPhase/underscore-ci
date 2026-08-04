# Reference — entrypoint runtime

Everything [`entrypoint.sh`](../../entrypoint.sh) reads and does, inside the
analysis container. Line numbers are indicative. Narrative:
[system-overview §4](../explanation/system-overview.md).

## Constants & environment

| Name | Value / source | Notes |
|---|---|---|
| `MODE` | input, default `auto` | `auto` → `pr` on `pull_request`, else `full`; validated against `pr\|full` |
| `DELIVERY` | input, default `artifact` | `artifact` inlines JSON into one HTML; else static dir (Pages) |
| `SLN` | input | repo-relative solution path (resolved against base/head worktrees) |
| `UNDERSCORE_LANG` | input, default `csharp` | picks the source glob & CLI `--lang` |
| `FAIL_ON_ERROR` | input, default `false` | honored in pr mode only |
| `UNDERSCORE_HOME` | `/opt/underscore` | where the image bakes the jar, roslyn-cli, report-dist |
| `COMMENT_MARKER` | `<!-- underscore-pr-report -->` | keys the single upserted PR comment |
| `FINDING_MARKER` | `<!-- underscore-finding -->` | tags inline findings review comments |
| `OUT_DIR` | `/tmp/underscore/out` | CLI `-o` target |
| `PUBLISH_DIR` | `$GITHUB_WORKSPACE/.underscore-report` | staged report (the outputs point here) |
| `RUN_URL` | from `GITHUB_SERVER_URL/REPOSITORY/actions/runs/RUN_ID` | linked in failure comments |
| `PR_DESCRIPTION_FILE` | `/tmp/underscore/pr-description.md` | exported if PR body non-empty; analyzer retrieval reads it |
| `UNDERSCORE_WWW_DIR` | `/tmp/underscore/www` | **full mode only** — keeps `analyze!` www-sync out of the client workspace |

### Enrichment env (set by entrypoint, consumed by the CLI)

| Env | When set |
|---|---|
| `FLOW_ENABLED=1`, `FLOW_ANALYZER=1` | token present (both modes) |
| `OVERVIEW_ENABLED=1` | token present **and** pr mode |
| `FINDINGS_ENABLED=1` | token present, pr mode, `findings: on` |
| `FLOW_WORKBOOK_ENABLED=1` | token present **and** full mode |
| `BPMN_MAX_JOURNEYS` | passed through from container env (optional full-mode cap) |

## pr vs full — the branch table

| Step | `pr` | `full` |
|---|---|---|
| PR metadata from event payload (base/head/number/title/branch) | ✅ (via `jq`, no API) | ❌ (dispatch-driven) |
| Infra-only skip (`git diff BASE...HEAD -- <glob>`) | ✅ → `skipped=true`, exit 0 | ❌ |
| CLI verb | `pr <ws> --base --head` | `analyze <ws>` |
| `OVERVIEW_ENABLED` | ✅ (if token) | ❌ |
| `FLOW_WORKBOOK_ENABLED` | ❌ | ✅ (if token) |
| `UNDERSCORE_WWW_DIR` set | ❌ | ✅ |
| PR comment upsert | ✅ | ❌ (step summary only) |
| Findings review | ✅ (if enabled) | ❌ |
| Failure posture | comment + honor `FAIL_ON_ERROR` | **always fail the step** |

## The source glob (infra-only skip)

`java`→`*.java`, `python`→`*.py`, else `*.cs`. The skip uses a **three-dot**
merge-base diff so only changes relative to the merge base count. No source
files changed → clean `exit 0`, output `skipped=true`, one step-summary line, no
comment, no red check.

## CLI invocation

**pr:**
```
java -jar underscore-cli.jar pr "$GITHUB_WORKSPACE" \
  --base "$BASE_SHA" --head "$HEAD_SHA" --lang "$UNDERSCORE_LANG" \
  -o "$OUT_DIR/pr-output.json" \
  [--sln <path>] [--pr-title <t>] [--branch <b>]
```
**full:**
```
UNDERSCORE_WWW_DIR=/tmp/underscore/www \
java -jar underscore-cli.jar analyze "$GITHUB_WORKSPACE" \
  --lang "$UNDERSCORE_LANG" -o "$OUT_DIR/pr-output.json" [--sln <path>]
```
Both must emit `pr-output.json`. A nonzero exit **or** an empty output triggers
`on_analysis_failure`.

## Staging → outputs

1. `mkdir -p PUBLISH_DIR`; copy `$UNDERSCORE_HOME/report-dist/.`, `pr-output.json`,
   and `manifest.json` (if present) into it.
2. `artifact` delivery: `node inject-report-data.mjs <template.html>
   <pr-output.json> <underscore-report.html>` → sets output `report-file`.
3. Always sets output `publish-dir`.

`manifest.json` is written by the CLI next to `-o`: pr manifests carry
`prNumber`/`prTitle`; full manifests carry `project`/`counts`/`bpmnFlows`.

## PR comment & findings review (pr mode, best-effort)

- **`upsert_comment`** — uses `GH_TOKEN` (falls back to `GITHUB_TOKEN`); absent →
  warn + return 0. Finds the existing comment by `COMMENT_MARKER` (paginated
  `gh api …/issues/<N>/comments`), PATCHes it if found else POSTs. Any failure
  warns and returns 0 — never fails the step.
- **Comment link form** — `VIEWER_URL` set → `…/reports/pr-<N>/underscore-report.html`;
  else artifact → "download from run artifacts"; else Pages
  `https://<owner>.github.io/<repo>/pr-<N>/`.
- **`post_findings_review`** — no-op unless `PR_NUMBER` set, output non-empty,
  and `.findings.items` length > 0. Retires prior marker-tagged inline comments,
  anchors each open finding to a HEAD line by grepping its excerpt, POSTs one
  review (`event: COMMENT`, `commit_id=HEAD_SHA`); a 422 (anchor outside diff)
  retries body-only.

## Failure posture (`on_analysis_failure`)

- **full**: always `fail` (exit 1), regardless of `FAIL_ON_ERROR`.
- **pr**: upsert a "failed, see logs" comment linking `RUN_URL`; then if
  `FAIL_ON_ERROR=true` fail, else `::warning::` and `exit 0` (green).
</content>

# How to run the analysis container locally

Smoke-test the analysis image against a local repository with a synthetic PR event — **no GitHub involved**. This is the fastest inner loop for `entrypoint.sh` and the backend path. Scope: running the image by hand and reading the result. Non-scope: building the image ([build-and-push-the-image](build-and-push-the-image.md)) and what the flags mean ([entrypoint-runtime](../reference/entrypoint-runtime.md)). Audience: maintainers.

## Prerequisites

- An analysis image: either `docker pull ghcr.io/logphase/underscore-ci:v2` (needs pull auth) or a locally built `:dev` tag.
- A local repository in a supported language with **full history** — a shallow clone will not contain the base SHA.
- Two commit SHAs in it to diff.

## 1. Write a synthetic event payload

`entrypoint.sh` reads base, head, number, title and branch from `GITHUB_EVENT_PATH` with `jq` and makes no API calls, so a hand-written file is enough:

```bash
cat > /tmp/event.json <<'EOF'
{"pull_request": {"number": 1, "title": "smoke test",
  "body": "",
  "base": {"sha": "<BASE_SHA>"},
  "head": {"sha": "<HEAD_SHA>", "ref": "feature-branch"}}}
EOF
```

## 2. Run the container

```bash
docker run --rm \
  --workdir /github/workspace \
  -e GITHUB_WORKSPACE=/github/workspace \
  -e GITHUB_EVENT_PATH=/github/workflow/event.json \
  -e GITHUB_EVENT_NAME=pull_request \
  -e GITHUB_REPOSITORY=you/repo \
  -e GITHUB_RUN_ID=0 \
  -e MODE=pr -e UNDERSCORE_LANG=csharp -e DELIVERY=artifact \
  -v /path/to/repo:/github/workspace \
  -v /tmp/event.json:/github/workflow/event.json:ro \
  ghcr.io/logphase/underscore-ci:dev
```

`GITHUB_REPOSITORY` is **not optional**: the script builds `RUN_URL` from it under `set -u`, so an unset value aborts the run before anything useful happens.

The report lands at `/path/to/repo/.underscore-report/underscore-report.html`. Open it directly — it works from `file://`.

## Variations

| Goal | Add |
|---|---|
| Structural-only (nothing leaves the machine) | nothing — this is the default with no analyzer env |
| Enriched | `-e INTENT_DRIFT_URL=http://host.docker.internal:8767 -e INTENT_DRIFT_TOKEN=<token>` |
| Explicitly structural despite a token | `-e ENRICHMENT=off` |
| Exercise the general code review | `-e REVIEW=on` with the analyzer env above |
| Exercise correctness findings | `-e FINDINGS=on` with the analyzer env above |
| Whole-repo report | `-e MODE=full` (no event payload needed for the diff; note full mode always fails the step on an analysis error) |
| A repo with several solutions | `-e SLN=path/to/App.sln` (repo-relative) |
| Another language | `-e UNDERSCORE_LANG=java\|python` |
| Inspect what the action would emit | mount two files and set `-e GITHUB_OUTPUT=/github/output -e GITHUB_STEP_SUMMARY=/github/step-summary` |

With `REVIEW=on` and no `GITHUB_TOKEN`, the analyzer call still happens (and is billed) but the comment upsert warns and returns — that is the designed posture, not a bug.

## What to check

1. The container exits 0 and `.underscore-report/underscore-report.html` exists.
2. The report opens and lands on the journeys page.
3. In enriched mode, BPMN badges and the PR overview appear; with `FINDINGS=on`, the findings page exists.
4. The log narrates the branch it took: mode resolution, the enrichment line, the `java -jar underscore-cli.jar …` invocation, and staging.

If analysis fails, the container mirrors CI posture: in `pr` mode it warns and exits 0 unless `FAIL_ON_ERROR=true`; in `full` mode it always fails.

## Keep a payload for renderer work

Copy the produced `.underscore-report/pr-output.json` somewhere stable and point `DEV_PR_OUTPUT` at it — that is how you get real data into `pnpm dev`. See [develop-the-renderer](develop-the-renderer.md).

# How to: run the analysis container locally

Smoke-test the analysis image against a local C#/.NET repo with a synthetic PR
event — **no GitHub required**. This is the fastest inner loop for the
`entrypoint.sh` / backend path.

## Prerequisites
- An analysis image. Either pull `ghcr.io/logphase/underscore-ci:v2` (needs
  pull auth) or build `:dev` — see [build-and-push-the-image](build-and-push-the-image.md).
- A local C#/.NET git repo with **full history** (`fetch-depth: 0` equivalent —
  a shallow clone will not have the base SHA).
- Two commit SHAs in that repo to diff (a base and a head).

## 1. Write a synthetic event payload

`entrypoint.sh` reads base/head/number/title/branch from `GITHUB_EVENT_PATH`
with `jq` — no API calls — so a hand-written file is enough:

```bash
cat > /tmp/event.json <<'EOF'
{"pull_request": {"number": 1, "title": "smoke test",
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
  -e GITHUB_REPOSITORY=you/repo -e GITHUB_RUN_ID=0 \
  -e MODE=pr -e UNDERSCORE_LANG=csharp -e DELIVERY=artifact \
  -v /path/to/csharp-repo:/github/workspace \
  -v /tmp/event.json:/github/workflow/event.json:ro \
  ghcr.io/logphase/underscore-ci:dev
```

The report lands at `/path/to/csharp-repo/.underscore-report/underscore-report.html`
— open it in a browser (it works from `file://`).

## Variations

- **Structural-only (no data leaves):** omit `INTENT_DRIFT_URL` /
  `INTENT_DRIFT_TOKEN` (already omitted above). The report skips BPMN/overview/
  findings.
- **Enriched:** add `-e INTENT_DRIFT_URL=http://host.docker.internal:8767 -e
  INTENT_DRIFT_TOKEN=<token>` pointing at a running analyzer. See
  [enrichment-and-privacy](../explanation/enrichment-and-privacy.md).
- **Full-repo report:** `-e MODE=full` (no event payload needed for the diff;
  it analyzes the whole checkout). Note: full mode always fails the step on
  analysis error.
- **Multiple solutions:** `-e SLN=path/to/App.sln` (repo-relative).
- **Capture outputs / step summary:** mount files and point
  `-e GITHUB_OUTPUT=/github/output -e GITHUB_STEP_SUMMARY=/github/step-summary`
  at them (as `action.yml` does) to inspect what the action would emit.

## What to check

1. The container exits 0 and `.underscore-report/underscore-report.html` exists.
2. The report opens and lands on the journeys page.
3. In enriched mode, BPMN badges and the PR overview appear.

If analysis fails, the container mirrors CI posture: in `pr` mode it warns and
exits 0 (unless `FAIL_ON_ERROR=true`); in `full` mode it fails. See
[entrypoint-runtime](../reference/entrypoint-runtime.md).
</content>

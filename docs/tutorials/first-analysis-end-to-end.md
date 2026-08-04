# Tutorial — your first analysis, end to end

**Goal:** starting from a fresh clone, produce a real Underscore report and open it in your browser, so you have seen every moving part at least once. This is a learning exercise; the [how-to guides](../README.md) are the faster route once you know the shape. Non-scope: CI wiring — you will not touch GitHub here. Audience: someone new to underscore-ci.

By the end you will have built the analysis image, run it against a real repository, opened the single-file report, and driven the renderer against that payload.

> Budget ~30–45 minutes, most of it the first image build. You need JDK 21+, the Clojure CLI, the .NET 10 SDK, pnpm with Node ≥ 24, Docker, and a sibling **underscore-desktop** checkout.

## Part 1 — build the analysis image

Start here rather than with the UI, because a fresh clone has no report payload to render: `dev-runs/` is gitignored and ships with nothing in it.

```bash
cd underscore-ci
./scripts/build-image.sh /path/to/underscore-desktop
```

This builds the backend uberjar, the Roslyn CLI and the Kotlin parser from the desktop checkout, builds the report (`pnpm build` and `pnpm build:singlefile`) from `src/` here, stages all five artifacts into `.docker-context/`, and produces `ghcr.io/logphase/underscore-ci:dev`.

**Checkpoint:** you can say which half of the image came from which repo. → [architecture-three-repos](../explanation/architecture-three-repos.md).

## Part 2 — run analysis on a real repository, with no GitHub

Pick a local C#/.NET repository with full history and two commit SHAs to diff. Write a synthetic event payload — `entrypoint.sh` parses it with `jq` and makes no API calls:

```bash
cat > /tmp/event.json <<'EOF'
{"pull_request": {"number": 1, "title": "tutorial", "body": "",
  "base": {"sha": "<BASE_SHA>"},
  "head": {"sha": "<HEAD_SHA>", "ref": "feature"}}}
EOF

docker run --rm --workdir /github/workspace \
  -e GITHUB_WORKSPACE=/github/workspace \
  -e GITHUB_EVENT_PATH=/github/workflow/event.json \
  -e GITHUB_EVENT_NAME=pull_request \
  -e GITHUB_REPOSITORY=you/repo -e GITHUB_RUN_ID=0 \
  -e MODE=pr -e UNDERSCORE_LANG=csharp -e DELIVERY=artifact \
  -v /path/to/csharp-repo:/github/workspace \
  -v /tmp/event.json:/github/workflow/event.json:ro \
  ghcr.io/logphase/underscore-ci:dev
```

Note what is *absent*: no `INTENT_DRIFT_URL`, no `INTENT_DRIFT_TOKEN`. This is a **structural-only** run, so nothing leaves your machine. Watch the log narrate SHA resolution, the enrichment line ("INTENT_DRIFT_TOKEN not set"), the `java -jar underscore-cli.jar pr …` invocation, and report staging.

**Checkpoint:** open `/path/to/csharp-repo/.underscore-report/underscore-report.html`. That is exactly the artifact a reviewer downloads, working from `file://` with no server. → [entrypoint-runtime](../reference/entrypoint-runtime.md).

## Part 3 — drive the renderer against your own payload

The report is a pure function of one JSON file. Prove it by feeding the payload you just produced to the dev server:

```bash
pnpm install
DEV_PR_OUTPUT=/path/to/csharp-repo/.underscore-report/pr-output.json pnpm dev
```

Open the printed URL and click into **Journeys**, then a **chapter**, then the **canvas**. This is the same UI you saw in Part 2; only the delivery differs — in CI the JSON is inlined into the HTML instead of fetched.

**Checkpoint:** you understand that the only thing CI changes is *which* `pr-output.json` gets loaded. → [the-report-renderer](../explanation/the-report-renderer.md).

## Part 4 — add enrichment (optional)

With a reachable analyzer and a token, re-run Part 2 with two more variables:

```bash
  -e INTENT_DRIFT_URL=http://host.docker.internal:8767 \
  -e INTENT_DRIFT_TOKEN=<token> \
```

The report now gains BPMN business-flow diagrams, a PR-overview narrative and the architecture diagram. Add `-e REVIEW=on` and the container also asks the analyzer to review the diff — a separate path that would post its own PR comment in real CI. This is the only time any data leaves the runner. → [enrichment-and-privacy](../explanation/enrichment-and-privacy.md).

## What you have learned

- The image is desktop-sourced backend plus this repo's renderer (Part 1).
- `entrypoint.sh` resolves SHAs from the event payload, runs the CLI, and stages the report (Part 2).
- The report is a static app driven entirely by `pr-output.json` (Part 3).
- Enrichment is opt-in and additive; structural-only leaks nothing (Part 4).

Next: read [system-overview](../explanation/system-overview.md) to see how `action.yml` wires these pieces together in real GitHub CI, then pick a change and use the matching how-to.

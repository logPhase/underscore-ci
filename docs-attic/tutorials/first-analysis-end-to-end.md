# Tutorial: your first analysis, end to end

**Goal:** starting from a fresh clone, produce a real Underscore report and open
it in your browser — so you have seen every moving part of the flow at least
once. This is a *learning* exercise; the how-to guides are the reference for
doing it faster later.

By the end you will have: run the renderer against a fixture, built the analysis
image, run it against a real C# repo, and opened both the multi-file and
single-file reports.

> Time: ~30–45 min (most of it the first image build). You need JDK 21+, Clojure
> CLI, .NET 10 SDK, pnpm (Node ≥ 24), Docker, and a sibling **underscore-desktop**
> checkout.

## Part 1 — see the report with zero infrastructure

The renderer is just a static app fed one JSON file. Prove that first.

```bash
cd underscore-ci
pnpm install
pnpm dev
```

Open the printed URL. The report boots against
`dev-runs/dev-fixture/pr-output.json` (a Vite dev middleware serves it as
`./pr-output.json`). Click into **Journeys**, open a **chapter**, look at the
**canvas**. You are looking at the exact UI a reviewer sees — the only thing
that changes in CI is *which* `pr-output.json` gets loaded.

**Checkpoint:** you understand the report is a pure function of `pr-output.json`.
→ deeper: [the-report-renderer](../explanation/the-report-renderer.md).

## Part 2 — build the analysis image

The report you just saw was rendered from a fixture. Now build the thing that
*produces* real payloads. The backend comes from the sibling desktop checkout.

```bash
./scripts/build-image.sh /path/to/underscore-desktop
```

This builds the backend uberjar + Roslyn CLI (from desktop), the report
(`pnpm build` + `build:singlefile`, from here), stages them into
`.docker-context/`, and builds `ghcr.io/logphase/underscore-ci:dev`.

**Checkpoint:** you understand the image bundles *desktop-sourced backend* +
*this-repo renderer*. → [architecture-three-repos](../explanation/architecture-three-repos.md).

## Part 3 — run analysis on a real repo (no GitHub)

Pick a local C#/.NET repo with full history and two commit SHAs to diff. Write a
synthetic event payload — `entrypoint.sh` reads it with `jq`, no API calls:

```bash
cat > /tmp/event.json <<'EOF'
{"pull_request": {"number": 1, "title": "tutorial",
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

We deliberately **omit** the analyzer env vars — this is a **structural-only**
run, so nothing leaves your machine. Watch the log: SHA resolution → the
`java -jar underscore-cli.jar pr …` invocation → report staging.

**Checkpoint:** open
`/path/to/csharp-repo/.underscore-report/underscore-report.html` in your
browser. That is the single-file artifact a reviewer downloads — it works from
`file://`. Compare it to what you saw in Part 1: same UI, real data.

## Part 4 — add enrichment (optional)

If you have a running analyzer and a token, re-run Part 3 with:

```bash
  -e INTENT_DRIFT_URL=http://host.docker.internal:8767 \
  -e INTENT_DRIFT_TOKEN=<token> \
```

Now the report gains BPMN business-flow diagrams and a PR-overview narrative.
This is the *only* difference enrichment makes, and the *only* time data leaves
the runner. → [enrichment-and-privacy](../explanation/enrichment-and-privacy.md).

## What you have learned

- The report is a static app driven by `pr-output.json` (Part 1).
- The image = desktop backend + this-repo renderer (Part 2).
- `entrypoint.sh` resolves SHAs, runs the CLI, stages the report (Part 3).
- Enrichment is opt-in and additive; structural-only leaks nothing (Part 4).

Next: read [system-overview](../explanation/system-overview.md) to see how these
pieces are wired together by `action.yml` in real GitHub CI, then pick a change
and use the relevant [how-to](../how-to/).
</content>

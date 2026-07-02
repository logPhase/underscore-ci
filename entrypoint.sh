#!/usr/bin/env bash
# Underscore PR Analysis — container action entrypoint.
#
# Runs the underscore CLI `pr` pipeline on the checked-out PR, stages the
# static report, upserts ONE PR comment (keyed by a hidden HTML marker),
# and delivers the report as a single-file HTML (artifact mode) or a
# publish dir (pages mode).
set -euo pipefail

DELIVERY="${DELIVERY:-artifact}"
SLN="${SLN:-}"
UNDERSCORE_LANG="${UNDERSCORE_LANG:-csharp}"
FAIL_ON_ERROR="${FAIL_ON_ERROR:-false}"

UNDERSCORE_HOME=/opt/underscore
COMMENT_MARKER='<!-- underscore-pr-report -->'
OUT_DIR=/tmp/underscore/out
PUBLISH_REL=".underscore-report"
PUBLISH_DIR="$GITHUB_WORKSPACE/$PUBLISH_REL"
RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID:-0}"
mkdir -p "$OUT_DIR"

fail() { echo "::error::$1" >&2; exit 1; }

set_output() { [[ -n "${GITHUB_OUTPUT:-}" ]] && echo "$1=$2" >>"$GITHUB_OUTPUT" || true; }

# --- Resolve PR metadata from the event payload (no API calls needed) -------
[[ -f "${GITHUB_EVENT_PATH:-}" ]] || fail "GITHUB_EVENT_PATH not found — this action must run on pull_request events"
BASE_SHA="$(jq -r '.pull_request.base.sha // empty' "$GITHUB_EVENT_PATH")"
HEAD_SHA="$(jq -r '.pull_request.head.sha // empty' "$GITHUB_EVENT_PATH")"
PR_NUMBER="$(jq -r '.pull_request.number // empty' "$GITHUB_EVENT_PATH")"
PR_TITLE="$(jq -r '.pull_request.title // empty' "$GITHUB_EVENT_PATH")"
PR_BRANCH="$(jq -r '.pull_request.head.ref // empty' "$GITHUB_EVENT_PATH")"
[[ -n "$BASE_SHA" && -n "$HEAD_SHA" && -n "$PR_NUMBER" ]] || fail "event payload has no pull_request base/head — trigger the workflow with 'on: pull_request'"
set_output pr-number "$PR_NUMBER"

# Author-stated intent — the analyzer's retrieval leans on it (PR_DESCRIPTION_FILE,
# see backend main.clj).
jq -r '.pull_request.body // empty' "$GITHUB_EVENT_PATH" >/tmp/underscore/pr-description.md
[[ -s /tmp/underscore/pr-description.md ]] && export PR_DESCRIPTION_FILE=/tmp/underscore/pr-description.md

# The workspace is mounted with a different owner than the container user.
git config --global --add safe.directory '*'

# --- PR comment upsert -------------------------------------------------------
# One comment per PR, found by COMMENT_MARKER in the body and edited in place.
# Best-effort by design: a failed comment (read-only token on fork PRs, missing
# pull-requests: write, transient API error) must never fail the step — the
# report was still produced and the artifact must still upload.
upsert_comment() {
  local body_file=$1 existing_id
  export GH_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
  if [[ -z "$GH_TOKEN" ]]; then
    echo "::warning::GITHUB_TOKEN not provided — skipping PR comment upsert"
    return 0
  fi
  existing_id="$(gh api "repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments" --paginate \
    --jq "[.[] | select(.body | contains(\"$COMMENT_MARKER\"))][0].id // empty")" || existing_id=""
  if [[ -n "$existing_id" ]]; then
    gh api -X PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$existing_id" -F "body=@$body_file" >/dev/null \
      || { echo "::warning::PR comment update failed (token scope? fork PR?) — report was still produced"; return 0; }
  else
    gh api -X POST "repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments" -F "body=@$body_file" >/dev/null \
      || { echo "::warning::PR comment creation failed (token scope? fork PR?) — report was still produced"; return 0; }
  fi
}

on_analysis_failure() {
  {
    echo "$COMMENT_MARKER"
    echo "## Underscore PR analysis — failed"
    echo ""
    echo "Analysis of \`$BASE_SHA\` → \`$HEAD_SHA\` did not complete. See the [workflow logs]($RUN_URL)."
  } >/tmp/underscore/failed-comment.md
  upsert_comment /tmp/underscore/failed-comment.md
  if [[ "$FAIL_ON_ERROR" == "true" ]]; then
    fail "underscore analysis failed (fail-on-error=true)"
  fi
  echo "::warning::underscore analysis failed — exiting green (fail-on-error=false)"
  exit 0
}

# --- Enrichment posture ------------------------------------------------------
# INTENT_DRIFT_TOKEN present  -> route BPMN flows + PR overview through the
#                                hosted intent-drift analyzer (FLOW_ANALYZER=1;
#                                no local fallback, no ANTHROPIC_API_KEY in CI).
# INTENT_DRIFT_TOKEN missing  -> structural-only; the pipeline soft-degrades
#                                and never fails on enrichment.
if [[ -n "${INTENT_DRIFT_TOKEN:-}" ]]; then
  export FLOW_ENABLED=1 FLOW_ANALYZER=1 OVERVIEW_ENABLED=1
  echo "Enrichment: enabled via ${INTENT_DRIFT_URL:-http://127.0.0.1:8767}"
else
  echo "Enrichment: INTENT_DRIFT_TOKEN not set — structural-only report"
fi

# --- Analysis ----------------------------------------------------------------
ANALYSIS_ARGS=(pr "$GITHUB_WORKSPACE"
  --base "$BASE_SHA" --head "$HEAD_SHA"
  --lang "$UNDERSCORE_LANG"
  -o "$OUT_DIR/pr-output.json")
# --sln must stay repo-relative: the backend pr pipeline resolves it against
# each base/head git worktree (pr/pipeline.clj analyze-worktree!), so an
# absolute $GITHUB_WORKSPACE-prefixed path would never exist in the worktrees.
[[ -n "$SLN" ]] && ANALYSIS_ARGS+=(--sln "$SLN")
[[ -n "$PR_TITLE" ]] && ANALYSIS_ARGS+=(--pr-title "$PR_TITLE")
[[ -n "$PR_BRANCH" ]] && ANALYSIS_ARGS+=(--branch "$PR_BRANCH")

echo "Running: java -jar underscore-cli.jar ${ANALYSIS_ARGS[*]}"
java -jar "$UNDERSCORE_HOME/underscore-cli.jar" "${ANALYSIS_ARGS[@]}" || on_analysis_failure
[[ -s "$OUT_DIR/pr-output.json" ]] || on_analysis_failure

# --- Stage the report --------------------------------------------------------
mkdir -p "$PUBLISH_DIR"
cp -R "$UNDERSCORE_HOME/report-dist/." "$PUBLISH_DIR/"
cp "$OUT_DIR/pr-output.json" "$PUBLISH_DIR/pr-output.json"
[[ -f "$OUT_DIR/manifest.json" ]] && cp "$OUT_DIR/manifest.json" "$PUBLISH_DIR/manifest.json"

REPORT_FILE=""
if [[ "$DELIVERY" == "artifact" ]]; then
  # Marker contract — keep in sync with scripts/inject-report-data.mjs:
  # the singlefile template ships with
  #   <script type="application/json" id="underscore-report-data">__UNDERSCORE_REPORT_DATA__</script>
  # inject-report-data.mjs replaces the __UNDERSCORE_REPORT_DATA__ token with
  # the pr-output.json content (every '<' escaped as \u003c so the payload
  # can never terminate the script tag). The report boot code reads this tag
  # first and falls back to fetch('./pr-output.json') when the tag still
  # holds the raw marker (i.e. the multi-file Pages build).
  node "$UNDERSCORE_HOME/scripts/inject-report-data.mjs" \
    "$UNDERSCORE_HOME/underscore-report.template.html" \
    "$OUT_DIR/pr-output.json" \
    "$PUBLISH_DIR/underscore-report.html"
  REPORT_FILE="$PUBLISH_REL/underscore-report.html"
  set_output report-file "$REPORT_FILE"
fi
set_output publish-dir "$PUBLISH_REL"

# --- summary.md from the run manifest ---------------------------------------
# manifest.json is written by the CLI next to the -o path (run_manifest.clj):
# prNumber, prTitle, counts{journeys,bpmn,summaries}, bpmnFlows[{journeyId,title}].
SUMMARY=/tmp/underscore/summary.md
{
  echo "$COMMENT_MARKER"
  echo "## Underscore PR analysis"
  echo ""
  if [[ -f "$OUT_DIR/manifest.json" ]]; then
    jq -r '
      "**PR #\(.prNumber // "?") — \(.prTitle // "untitled")**",
      "",
      "| Journeys | Business flows (BPMN) | Summaries |",
      "|---:|---:|---:|",
      "| \(.counts.journeys // 0) | \(.counts.bpmn // 0) | \(.counts.summaries // 0) |",
      "",
      (if ((.bpmnFlows // []) | length) > 0 then
        "**Business flows touched:**",
        ((.bpmnFlows // [])[] | "- \(.title)")
      else empty end)
    ' "$OUT_DIR/manifest.json"
  else
    echo "_Analysis completed; no manifest was produced._"
  fi
  echo ""
  if [[ "$DELIVERY" == "artifact" ]]; then
    echo "Interactive report: download **underscore-report** from [this run's artifacts]($RUN_URL) and open the HTML."
  else
    OWNER="${GITHUB_REPOSITORY%%/*}"
    REPO="${GITHUB_REPOSITORY#*/}"
    echo "Interactive report: https://${OWNER}.github.io/${REPO}/pr-${PR_NUMBER}/"
  fi
} >"$SUMMARY"

# `|| …` also suspends set -e inside upsert_comment, so no gh hiccup can
# abort the script after a successful analysis.
upsert_comment "$SUMMARY" || echo "::warning::PR comment upsert failed — report was still produced"
[[ -n "${GITHUB_STEP_SUMMARY:-}" ]] && cat "$SUMMARY" >>"$GITHUB_STEP_SUMMARY"

echo "Done. delivery=$DELIVERY publish-dir=$PUBLISH_REL${REPORT_FILE:+ report-file=$REPORT_FILE}"

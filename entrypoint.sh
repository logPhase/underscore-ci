#!/usr/bin/env bash
# Underscore analysis — container action entrypoint.
#
# MODE=pr (default): runs the underscore CLI `pr` pipeline on the checked-out
# PR, stages the static report, upserts ONE PR comment (keyed by a hidden
# HTML marker), and delivers the report as a single-file HTML (artifact mode)
# or a publish dir (pages mode).
#
# MODE=full: on-demand whole-repo report (workflow_dispatch). Runs the
# `analyze` pipeline over the entire checkout — no pull_request payload
# needed, no PR comment. Report staging and delivery are identical to pr
# mode. Failure posture differs: an analysis failure ALWAYS fails the step
# regardless of FAIL_ON_ERROR — there is no PR to post a failure comment on,
# and a green no-op is misleading for a manually dispatched run.
set -euo pipefail

MODE="${MODE:-auto}"
# 'auto' resolves from the event: a pull_request → pr, anything else → full.
# Lets one workflow serve both without the caller branching on the trigger.
if [[ "$MODE" == "auto" ]]; then
  [[ "${GITHUB_EVENT_NAME:-}" == "pull_request" ]] && MODE=pr || MODE=full
fi
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

case "$MODE" in pr|full) ;; *) fail "unknown MODE '$MODE' — expected 'pr' or 'full'";; esac

# --- Resolve PR metadata from the event payload (no API calls needed) -------
# pr mode only — full mode is dispatch-driven, has no pull_request payload,
# and never touches PR metadata or the pr-number output.
if [[ "$MODE" == "pr" ]]; then
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
fi

# The workspace is mounted with a different owner than the container user.
git config --global --add safe.directory '*'

# --- Skip source-less PRs (infrastructure-only changes) ----------------------
# A PR that touches no source files for the selected language (helm, terraform,
# CI, docs, …) has nothing to analyze — the pipeline would only fail or produce
# an empty report and redden the check. Skip cleanly instead: exit 0, no PR
# comment, `skipped` output set, one line in the step summary. Merge-base
# (three-dot) diff so only the PR's own changes count.
if [[ "$MODE" == "pr" ]]; then
  case "$UNDERSCORE_LANG" in
    java)   SRC_GLOB='*.java' ;;
    python) SRC_GLOB='*.py' ;;
    *)      SRC_GLOB='*.cs' ;;
  esac
  SRC_CHANGED="$(git -C "$GITHUB_WORKSPACE" diff --name-only "$BASE_SHA...$HEAD_SHA" -- "$SRC_GLOB" 2>/dev/null | head -1 || true)"
  if [[ -z "$SRC_CHANGED" ]]; then
    echo "No ${SRC_GLOB} changes between base and head — infrastructure-only PR, skipping Underscore analysis."
    set_output skipped "true"
    [[ -n "${GITHUB_STEP_SUMMARY:-}" ]] && \
      echo "**Underscore:** skipped — this PR changes no \`${SRC_GLOB}\` files (infrastructure-only)." >>"$GITHUB_STEP_SUMMARY"
    exit 0
  fi
fi

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

# --- findings → PR review (inline where anchorable) --------------------------
# Open findings become inline review comments anchored to the finding's file +
# excerpt line at HEAD; resolved ones ride struck-through in the review body.
# Previous runs' inline comments (marker-tagged) are retired first so a PR
# never accumulates stale anchors. Soft everywhere — reviews are additive.
FINDING_MARKER="<!-- underscore-finding -->"

post_findings_review() {
  [[ -n "${PR_NUMBER:-}" && -s "$OUT_DIR/pr-output.json" ]] || return 0
  local n_items
  n_items=$(jq '(.findings.items // []) | length' "$OUT_DIR/pr-output.json" 2>/dev/null || echo 0)
  [[ "$n_items" == "0" || -z "$n_items" ]] && return 0

  # Retire the previous run's inline finding comments.
  gh api "repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER/comments" --paginate \
    -q ".[] | select(.body | contains(\"$FINDING_MARKER\")) | .id" 2>/dev/null |
  while read -r cid; do
    [[ -n "$cid" ]] && gh api -X DELETE "repos/$GITHUB_REPOSITORY/pulls/comments/$cid" >/dev/null 2>&1 || true
  done

  # Inline comments for OPEN findings whose excerpt anchors to a HEAD line.
  local comments=/tmp/underscore/finding-comments.jsonl
  : > "$comments"
  while IFS= read -r f; do
    file=$(jq -r '.file // empty' <<<"$f")
    [[ -n "$file" && -f "$GITHUB_WORKSPACE/$file" ]] || continue
    first=$(jq -r '.excerpt // empty' <<<"$f" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$' | head -1)
    [[ -n "$first" ]] || continue
    line=$(grep -nF -- "$first" "$GITHUB_WORKSPACE/$file" | head -1 | cut -d: -f1)
    [[ -n "$line" ]] || continue
    jq -n --arg path "$file" --argjson line "$line" --arg marker "$FINDING_MARKER" --argjson f "$f" '
      {path: $path, line: $line, side: "RIGHT",
       body: ($marker + "\n**[\($f.severity // "?") · \(if ($f.kind // "") == "divergence" then "docs disagree" else "correctness" end)] \($f.title // "")**\n\n"
              + ($f.detail // "")
              + (if ($f.expected // "") != "" then "\n\n**Documented:** \($f.expected)" else "" end)
              + (if ($f.observed // "") != "" then "\n**In the code:** \($f.observed)" else "" end)
              + (if (($f.citations // []) | length) > 0 then "\n\n_Sources: \([$f.citations[].title] | join("; "))_" else "" end)
              + (if ($f.check // "") != "" then "\n\n**Verify:** \($f.check)" else "" end))}' \
      >>"$comments" 2>/dev/null || true
  done < <(jq -c '(.findings.items // [])[] | select((.status // "open") != "resolved")' "$OUT_DIR/pr-output.json")

  local body cs review
  body=$(jq -r --arg marker "$FINDING_MARKER" '
    (.findings.items // []) as $items |
    ([$items[] | select((.status // "open") != "resolved")]) as $open |
    ([$items[] | select((.status // "open") == "resolved")]) as $res |
    $marker + "\n### Underscore correctness findings\n"
    + (if ($open | length) > 0
       then "\n" + ([$open[] | "- **[\(.severity)]** \(.title)"] | join("\n")) + "\n"
       else "\nAll previously reported findings are resolved. ✅\n" end)
    + (if ($res | length) > 0
       then "\n**Resolved since earlier pushes:**\n" + ([$res[] | "- ~~\(.title)~~ ✅"] | join("\n")) + "\n"
       else "" end)
    + "\nGrounded against this repository'\''s institutional knowledge — full evidence in the Findings tab of the interactive report."
  ' "$OUT_DIR/pr-output.json")
  cs=/tmp/underscore/finding-comments.json
  jq -s '.' "$comments" >"$cs" 2>/dev/null || echo '[]' >"$cs"
  review=/tmp/underscore/finding-review.json
  jq -n --arg body "$body" --arg commit "$HEAD_SHA" --slurpfile cs "$cs" \
     '{commit_id: $commit, event: "COMMENT", body: $body, comments: $cs[0]}' >"$review"
  if ! gh api -X POST "repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER/reviews" --input "$review" >/dev/null 2>&1; then
    # An inline anchor outside the diff 422s the whole review — retry body-only.
    jq 'del(.comments)' "$review" >"$review.body" &&
      gh api -X POST "repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER/reviews" --input "$review.body" >/dev/null
  fi
}

on_analysis_failure() {
  if [[ "$MODE" == "full" ]]; then
    # Full mode: ALWAYS fail the step, regardless of FAIL_ON_ERROR. There is
    # no PR to post a failure comment on, and a green no-op would make a
    # manually dispatched run look like it produced a report when it didn't.
    fail "underscore full-repo analysis failed — see the logs above"
  fi
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
# INTENT_DRIFT_TOKEN present  -> route enrichment through the hosted
#                                intent-drift analyzer (no local fallback, no
#                                ANTHROPIC_API_KEY in CI). Which enrichment
#                                depends on the pipeline:
#                                - pr:   BPMN flows + PR overview + summaries
#                                  (FLOW_ENABLED/FLOW_ANALYZER/OVERVIEW_ENABLED,
#                                  read by pr! in backend main.clj)
#                                - full: BPMN flows + journey workbook summaries.
#                                  analyze! now runs the SAME PR-agnostic
#                                  post-analysis enrichment pr! does — BPMN via
#                                  FLOW_ENABLED+FLOW_ANALYZER (analyzer-only, no
#                                  local fallback) and summaries via
#                                  FLOW_WORKBOOK_ENABLED. The PR-overview
#                                  narrative stays pr-mode-only: it is a PR-delta
#                                  artifact and the analyzer /overview endpoint
#                                  has no full-repo mode, so OVERVIEW_ENABLED is
#                                  intentionally NOT set for full. Optional cost
#                                  cap: BPMN_MAX_JOURNEYS (top-N journeys by step
#                                  count) — passed through from the container env
#                                  (action.yml forwards it); read directly by
#                                  analyze!, so no re-export is needed here.
# INTENT_DRIFT_TOKEN missing  -> structural-only; the pipeline soft-degrades
#                                and never fails on enrichment.
if [[ -n "${INTENT_DRIFT_TOKEN:-}" ]]; then
  if [[ "$MODE" == "pr" ]]; then
    export FLOW_ENABLED=1 FLOW_ANALYZER=1 OVERVIEW_ENABLED=1
    # Correctness findings are OPT-IN (findings: 'on') — a dedicated agent
    # run per unique change set, so the default spends nothing.
    if [[ "${FINDINGS:-off}" == "on" ]]; then
      export FINDINGS_ENABLED=1
      echo "Enrichment: enabled incl. correctness findings via ${INTENT_DRIFT_URL:-http://127.0.0.1:8767}"
    else
      echo "Enrichment: enabled via ${INTENT_DRIFT_URL:-http://127.0.0.1:8767} (findings: off)"
    fi
  else
    export FLOW_ENABLED=1 FLOW_ANALYZER=1 FLOW_WORKBOOK_ENABLED=1
    echo "Enrichment: BPMN flows + journey summaries via ${INTENT_DRIFT_URL:-http://127.0.0.1:8767}${BPMN_MAX_JOURNEYS:+ (BPMN_MAX_JOURNEYS=$BPMN_MAX_JOURNEYS)} (full mode; the PR-overview narrative is pr-mode-only)"
  fi
else
  echo "Enrichment: INTENT_DRIFT_TOKEN not set — structural-only report"
fi

# --- Analysis ----------------------------------------------------------------
# Both modes write the output JSON as pr-output.json — that name is the
# renderer's boot contract (it fetches ./pr-output.json when the inline data
# tag is absent), so the full-repo output keeps it too.
if [[ "$MODE" == "pr" ]]; then
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
else
  # Whole-repo analysis of the checkout as-is. --sln is resolved against the
  # repo path by analyze! (backend main.clj), so repo-relative is fine here
  # too. analyze!'s CLI path also syncs the output into $UNDERSCORE_WWW_DIR
  # (default ./webapp/public relative to cwd) — point it at /tmp so nothing
  # is written into the client workspace.
  export UNDERSCORE_WWW_DIR=/tmp/underscore/www
  ANALYSIS_ARGS=(analyze "$GITHUB_WORKSPACE"
    --lang "$UNDERSCORE_LANG"
    -o "$OUT_DIR/pr-output.json")
  [[ -n "$SLN" ]] && ANALYSIS_ARGS+=(--sln "$SLN")
fi

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
# manifest.json is written by the CLI next to the -o path (run_manifest.clj).
# pr runs carry prNumber/prTitle; analyze (full) runs don't — they have
# kind/project/timestamp/counts{journeys,bpmn,summaries}/bpmnFlows only.
SUMMARY=/tmp/underscore/summary.md
if [[ "$MODE" == "pr" ]]; then
  {
    echo "$COMMENT_MARKER"
    echo "## Underscore PR analysis"
    echo ""
    if [[ -f "$OUT_DIR/manifest.json" ]]; then
      jq -r '
        "**PR #\(.prNumber // "?") — \(.prTitle // "untitled")**",
        "",
        "| Journeys | Business flows (BPMN) | Summaries | Findings |",
        "|---:|---:|---:|---:|",
        "| \(.counts.journeys // 0) | \(.counts.bpmn // 0) | \(.counts.summaries // 0) | \(.counts.findings // 0) |",
        "",
        (if ((.bpmnFlows // []) | length) > 0 then
          "**Business flows touched:**",
          ((.bpmnFlows // [])[] | "- \(.title)")
        else empty end)
      ' "$OUT_DIR/manifest.json"
      # Findings come from the payload (not the manifest): items carry the
      # per-PR ledger status, so fixed ones show struck-through, not deleted.
      jq -r '
        (.findings.items // []) as $items |
        ([$items[] | select((.status // "open") != "resolved")]) as $open |
        ([$items[] | select((.status // "open") == "resolved")]) as $res |
        (if ($open | length) > 0 then
          "",
          "**Correctness findings** (checked against your institutional knowledge — details in the report):",
          ($open[] | "- [\(.severity)] \(.title)")
        else empty end),
        (if ($res | length) > 0 then
          "",
          "**Resolved since earlier pushes:**",
          ($res[] | "- ~~\(.title)~~ ✅")
        else empty end)
      ' "$OUT_DIR/pr-output.json" 2>/dev/null || true
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
  post_findings_review || echo "::warning::findings review post failed — report and comment were still produced"
else
  # Full mode: step summary only — there is no PR comment to upsert.
  {
    echo "## Underscore full-repo report"
    echo ""
    if [[ -f "$OUT_DIR/manifest.json" ]]; then
      # analyze! now runs BPMN enrichment too, so counts.bpmn/bpmnFlows can be
      # non-empty for `analyze` runs — build-manifest counts them generically
      # (run_manifest.clj), same as pr mode.
      jq -r '
        "**\(.project // "repository")** — whole-repo analysis",
        "",
        "| Journeys | Business flows (BPMN) | Summaries |",
        "|---:|---:|---:|",
        "| \(.counts.journeys // 0) | \(.counts.bpmn // 0) | \(.counts.summaries // 0) |",
        "",
        (if ((.bpmnFlows // []) | length) > 0 then
          "**Business flows:**",
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
      echo "Interactive report: static dir staged at \`$PUBLISH_REL\` (see the publish-dir output)."
    fi
  } >"$SUMMARY"
fi
[[ -n "${GITHUB_STEP_SUMMARY:-}" ]] && cat "$SUMMARY" >>"$GITHUB_STEP_SUMMARY"

echo "Done. delivery=$DELIVERY publish-dir=$PUBLISH_REL${REPORT_FILE:+ report-file=$REPORT_FILE}"

#!/usr/bin/env bash
# Publish an Underscore report to the orphan reports branch + maintain the
# hosted viewer's data. Runs as a composite step of the action (on the runner,
# in the client's checkout) so NO client workflow ever hand-rolls this.
#
# Handles both modes:
#   pr   — one dir per PR (reports/pr-<N>, refreshed each push); runs.json entry
#          upserted by PR; "journeys" = the count the diff TOUCHES (prStatus).
#   full — timestamped dir (reports/<stamp>-run-<n>) + latest/; runs.json entry
#          appended; "journeys" = repo total.
# Always (re)writes the branded, data-driven landing page (index.html) bundled
# with the action, so a client's viewer branch is self-bootstrapping.
#
# All GitHub context arrives via env (never inline interpolation) — injection-safe.
set -euo pipefail

: "${REPORT_FILE:?}" "${REPO_SLUG:?}" "${REPORTS_BRANCH:?}" "${GITHUB_ACTION_PATH:?}"
[[ -f "$REPORT_FILE" ]] || { echo "::error::report-file '$REPORT_FILE' not found"; exit 1; }

# Effective mode: resolve 'auto' from the event.
MODE="${MODE_INPUT:-auto}"
if [[ "$MODE" == "auto" ]]; then
  [[ "${EVENT_NAME:-}" == "pull_request" ]] && MODE=pr || MODE=full
fi

git config user.name  "underscore-bot"
git config user.email "bot@logphase.io"

WORKTREE=/tmp/underscore-reports
rm -rf "$WORKTREE"
# Two publish targets:
#   external (REPORTS_REPO + REPORTS_DEPLOY_KEY set)  — a DEDICATED reports
#     repository, pushed over SSH with a write deploy key. Keeps report data
#     out of the code repo entirely (no "recent pushes — open a PR?" banner
#     noise for the team). REPORTS_BRANCH conventionally = the source repo
#     name, so one reports repo serves a whole multi-repo platform.
#   same-repo (default) — the orphan REPORTS_BRANCH of the analyzed repo.
REPORTS_REMOTE=origin
if [[ -n "${REPORTS_REPO:-}" && -n "${REPORTS_DEPLOY_KEY:-}" ]]; then
  KEYFILE=/tmp/underscore-reports-key
  printf '%s\n' "$REPORTS_DEPLOY_KEY" >"$KEYFILE"
  chmod 600 "$KEYFILE"
  export GIT_SSH_COMMAND="ssh -i $KEYFILE -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes"
  REPORTS_REMOTE="git@github.com:${REPORTS_REPO}.git"
  if git ls-remote --exit-code --heads "$REPORTS_REMOTE" "$REPORTS_BRANCH" >/dev/null 2>&1; then
    git clone --depth 1 -b "$REPORTS_BRANCH" "$REPORTS_REMOTE" "$WORKTREE"
  else
    git init -q "$WORKTREE"
    git -C "$WORKTREE" checkout -q --orphan "$REPORTS_BRANCH"
  fi
  git -C "$WORKTREE" config user.name  "underscore-bot"
  git -C "$WORKTREE" config user.email "bot@logphase.io"
elif git ls-remote --exit-code --heads origin "$REPORTS_BRANCH" >/dev/null 2>&1; then
  git fetch origin "$REPORTS_BRANCH:$REPORTS_BRANCH" 2>/dev/null || git fetch origin "$REPORTS_BRANCH"
  git worktree add "$WORKTREE" "$REPORTS_BRANCH"
else
  git worktree add --orphan -b "$REPORTS_BRANCH" "$WORKTREE"
  git -C "$WORKTREE" rm -rf --cached . >/dev/null 2>&1 || true
fi

# Counts from the run manifest; PROJECT falls back to the repo name.
MANIFEST="$PUBLISH_DIR/manifest.json"
PROUT="$PUBLISH_DIR/pr-output.json"
BPMN=0; SUM=0; FND=0; PROJECT="${REPO_SLUG#*/}"
if [[ -f "$MANIFEST" ]]; then
  BPMN=$(jq -r '.counts.bpmn // 0' "$MANIFEST")
  SUM=$(jq -r '.counts.summaries // 0' "$MANIFEST")
  FND=$(jq -r '.counts.findings // 0' "$MANIFEST")
  PROJECT=$(jq -r --arg d "${REPO_SLUG#*/}" '.project // $d' "$MANIFEST")
fi

STAMP="$(date -u +%Y%m%d-%H%M%S)"
ISO="${STAMP:0:4}-${STAMP:4:2}-${STAMP:6:2}T${STAMP:9:2}:${STAMP:11:2}:${STAMP:13:2}Z"

if [[ "$MODE" == "pr" ]]; then
  DEST="reports/pr-${PR_NUMBER}"
  rm -rf "${WORKTREE:?}/$DEST"; mkdir -p "$WORKTREE/$DEST"
  cp "$REPORT_FILE" "$WORKTREE/$DEST/underscore-report.html"
  # PR-scoped journey count = journeys the diff touches (prStatus set).
  JRN=0
  [[ -f "$PROUT" ]] && JRN=$(jq '[.journeys[]? | select(.prStatus != null)] | length' "$PROUT")
  ID="pr-${PR_NUMBER}"; REF="${PR_HEAD_REF}"; SHA="${PR_HEAD_SHA}"
  PRN="${PR_NUMBER}"
  PRT="$(gh pr view "$PR_NUMBER" -R "$REPO_SLUG" --json title -q .title 2>/dev/null || echo '')"
else
  DEST="reports/${STAMP}-run-${RUN_NUMBER}"
  mkdir -p "$WORKTREE/$DEST" "$WORKTREE/latest"
  cp "$REPORT_FILE" "$WORKTREE/$DEST/underscore-report.html"
  cp "$REPORT_FILE" "$WORKTREE/latest/underscore-report.html"
  JRN=0; [[ -f "$MANIFEST" ]] && JRN=$(jq -r '.counts.journeys // 0' "$MANIFEST")
  ID="run-${RUN_NUMBER}"; REF="${REF_NAME}"; SHA="${HEAD_SHA}"; PRN=""; PRT=""
fi

# Branded, data-driven landing page ships WITH the action — self-bootstrapping.
cp "$GITHUB_ACTION_PATH/viewer/index.html" "$WORKTREE/index.html"
touch "$WORKTREE/.nojekyll"

SHORT="${SHA:0:7}"
REC=$(jq -n \
  --arg id "$ID" --arg dir "$DEST" --arg stamp "$STAMP" --arg run "$RUN_NUMBER" \
  --arg date "$ISO" --arg ref "$REF" --arg sha "$SHA" --arg short "$SHORT" \
  --arg actor "$ACTOR" --arg pr "$PRN" --arg prTitle "$PRT" \
  --arg repo "$REPO_SLUG" --arg project "$PROJECT" \
  --arg j "$JRN" --arg b "$BPMN" --arg s "$SUM" --arg f "$FND" \
  '{id:$id, dir:$dir, stamp:$stamp, run:($run|tonumber), date:$date, ref:$ref,
    sha:(if $sha=="" then null else $sha end),
    shortSha:(if $short=="" then null else $short end),
    actor:$actor,
    pr:(if $pr=="" then null else $pr end),
    prTitle:(if $prTitle=="" then null else $prTitle end),
    repo:$repo, project:$project,
    journeys:($j|tonumber), bpmn:($b|tonumber), summaries:($s|tonumber),
    findings:($f|tonumber)}')

cd "$WORKTREE"
[[ -f runs.json ]] || echo '[]' > runs.json
if [[ "$MODE" == "pr" ]]; then
  jq --argjson r "$REC" 'map(select(.pr != $r.pr)) + [$r]' runs.json > runs.tmp
else
  jq --argjson r "$REC" '. + [$r]' runs.json > runs.tmp
fi
mv runs.tmp runs.json
cd - >/dev/null

git -C "$WORKTREE" add -A
git -C "$WORKTREE" commit -m "underscore ${ID} report (${STAMP})" || { echo "nothing to publish"; exit 0; }
# Retry once on the race between concurrent runs pushing the branch.
git -C "$WORKTREE" push "$REPORTS_REMOTE" "HEAD:refs/heads/$REPORTS_BRANCH" || {
  git -C "$WORKTREE" pull --rebase "$REPORTS_REMOTE" "$REPORTS_BRANCH"
  git -C "$WORKTREE" push "$REPORTS_REMOTE" "HEAD:refs/heads/$REPORTS_BRANCH"
}

if [[ -n "${VIEWER_URL:-}" ]]; then
  BASE="${VIEWER_URL%/}"
  {
    echo "## Underscore report — hosted viewer"
    echo ""
    echo "- This run (${ID}): ${BASE}/${DEST}/underscore-report.html"
    echo "- All sessions: ${BASE}/"
  } >>"${GITHUB_STEP_SUMMARY:-/dev/null}"
fi

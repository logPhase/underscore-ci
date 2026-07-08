#!/usr/bin/env bash
# Retire a PR's published report when the CURRENT revision has nothing to
# analyze (an infrastructure-only PR — no source files for the selected
# language). A PR that once changed C# gets a report; if a later push removes
# the C#, the skip on the new run must not leave that stale analysis on the
# dashboard. This removes reports/pr-<N>/ and its runs.json entry from the
# reports branch, and rewrites the PR comment (only if one already exists) to
# an honest note. A never-analyzed infra PR is a clean no-op — no branch
# change, no comment noise.
#
# Same reports-target resolution as publish-report.sh (external dedicated repo
# via deploy key, or the same-repo orphan branch). All context via env.
set -uo pipefail

: "${PR_NUMBER:?}" "${REPO_SLUG:?}" "${REPORTS_BRANCH:?}"
[[ -n "${PR_NUMBER}" ]] || { echo "no PR number — nothing to retire"; exit 0; }

COMMENT_MARKER="<!-- underscore-pr-report -->"

git config --global user.name  "underscore-bot" 2>/dev/null || true
git config --global user.email "bot@logphase.io" 2>/dev/null || true

WORKTREE=/tmp/underscore-reports-retire
rm -rf "$WORKTREE"

REPORTS_REMOTE=origin
if [[ -n "${REPORTS_REPO:-}" && -n "${REPORTS_DEPLOY_KEY:-}" ]]; then
  KEYFILE=/tmp/underscore-reports-retire-key
  printf '%s\n' "$REPORTS_DEPLOY_KEY" >"$KEYFILE"
  chmod 600 "$KEYFILE"
  export GIT_SSH_COMMAND="ssh -i $KEYFILE -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes"
  REPORTS_REMOTE="git@github.com:${REPORTS_REPO}.git"
  git ls-remote --exit-code --heads "$REPORTS_REMOTE" "$REPORTS_BRANCH" >/dev/null 2>&1 || {
    echo "reports branch '$REPORTS_BRANCH' does not exist yet — nothing to retire"; exit 0; }
  git clone --depth 1 -b "$REPORTS_BRANCH" "$REPORTS_REMOTE" "$WORKTREE" 2>/dev/null || {
    echo "::warning::could not clone reports branch — skipping retire"; exit 0; }
else
  git ls-remote --exit-code --heads origin "$REPORTS_BRANCH" >/dev/null 2>&1 || {
    echo "reports branch '$REPORTS_BRANCH' does not exist yet — nothing to retire"; exit 0; }
  git fetch origin "$REPORTS_BRANCH" 2>/dev/null || true
  git worktree add "$WORKTREE" "origin/$REPORTS_BRANCH" 2>/dev/null \
    || git clone -b "$REPORTS_BRANCH" "$(git remote get-url origin)" "$WORKTREE"
fi
git -C "$WORKTREE" config user.name  "underscore-bot"
git -C "$WORKTREE" config user.email "bot@logphase.io"

DEST="reports/pr-${PR_NUMBER}"
if [[ ! -d "$WORKTREE/$DEST" ]]; then
  echo "no existing report at $DEST — infra-only PR was never analyzed, nothing to retire"
else
  echo "retiring stale report $DEST (current revision changes no source files)"
  git -C "$WORKTREE" rm -rq "$DEST" || rm -rf "$WORKTREE/$DEST"
  # Drop the pr-<N> entry from runs.json so the dashboard stops listing it.
  if [[ -f "$WORKTREE/runs.json" ]]; then
    jq --arg pr "$PR_NUMBER" 'map(select((.pr // "") != $pr))' \
      "$WORKTREE/runs.json" > "$WORKTREE/runs.json.tmp" \
      && mv "$WORKTREE/runs.json.tmp" "$WORKTREE/runs.json"
    git -C "$WORKTREE" add runs.json
  fi
  git -C "$WORKTREE" commit -qm "retire pr-${PR_NUMBER} — revision has no source changes to analyze" \
    && git -C "$WORKTREE" push "$REPORTS_REMOTE" "HEAD:refs/heads/$REPORTS_BRANCH" \
    || { git -C "$WORKTREE" pull --rebase "$REPORTS_REMOTE" "$REPORTS_BRANCH" 2>/dev/null; \
         git -C "$WORKTREE" push "$REPORTS_REMOTE" "HEAD:refs/heads/$REPORTS_BRANCH"; }
fi

# Rewrite the PR comment to an honest note — ONLY if a prior one exists, so a
# never-analyzed infra PR gets no comment at all.
export GH_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [[ -n "$GH_TOKEN" ]]; then
  CID="$(gh api "repos/${REPO_SLUG}/issues/${PR_NUMBER}/comments" --paginate \
          -q "[.[] | select(.body | contains(\"${COMMENT_MARKER}\"))] | last | .id" 2>/dev/null || true)"
  if [[ -n "$CID" && "$CID" != "null" ]]; then
    BODY="${COMMENT_MARKER}"$'\n'"**Underscore** — this revision changes no C# files, so there is nothing to analyze. The previous analysis was retired."
    gh api -X PATCH "repos/${REPO_SLUG}/issues/comments/${CID}" -f body="$BODY" >/dev/null 2>&1 \
      && echo "updated PR comment to the infra-only note" || true
  fi
fi
echo "retire complete."

# How to: deploy the viewer & onboarding app

Stand up the two hosted ops components. Neither runs analysis — full topology
in [deployment-viewer-and-app](../reference/deployment-viewer-and-app.md). This
guide is the operational sequence; consult `viewer/k8s/README.md` and
`github-app/README.md` for the environment-specific values.

## The hosted viewer

The viewer is nginx + a git-sync sidecar that serves the `underscore-reports`
branch. New CI commits appear with no redeploy.

1. **Build & push the image.** From `viewer/`, build
   `…/underscore-viewer:dev` and push to your registry (see `viewer/README.md`).
2. **Create the secrets** in the target namespace:
   - `underscore-reports-git` — auth for the private reports repo (git-sync).
   - `underscore-viewer-htpasswd` — basic-auth users.
   - `underscore-viewer-ask` — the analyzer token the `/ask` relay injects.
3. **Apply the manifests:** `kubectl apply -f viewer/k8s/` — Deployment (git-sync
   + nginx sharing an `emptyDir`), Service, Ingress, and the
   `underscore-viewer-nginx` ConfigMap (which fully replaces the baked nginx
   config and adds basic auth, `/healthz`, `/readyz`, and the `/ask` relay).
4. **Point CI at it.** Set the client repo variable `UNDERSCORE_VIEWER_URL` to
   the viewer's base URL (e.g. `https://…/underscore`). The action then links
   each PR comment to `…/reports/pr-<N>/underscore-report.html`.

The git-sync sidecar tracks `GITSYNC_REF=underscore-reports` on the configured
`GITSYNC_REPO`. To serve a **different source repo**, regenerate the
`*-iris.yaml` variant rather than hand-editing (see the header comment in
`deployment-iris.yaml`).

### Verify
- `/readyz` returns 200 only after the first `index.html` syncs.
- The landing page lists runs (or shows the honest "next run will write this"
  message before any report exists).
- From a report page served over http(s), the **Ask** panel appears; from a
  downloaded artifact it does not.

## The onboarding GitHub App

The App opens a PR wiring the workflow into a newly-installed repo.

1. **Build & push** `…/underscore-app:dev` (see `github-app/README.md`).
2. **Register the App** from `github-app/app-manifest.json` (permissions:
   contents/pull_requests/workflows/secrets/actions write, metadata read; events
   `installation`, `installation_repositories`; webhook
   `…/underscore-app/webhook`).
3. **Create the `underscore-app-secrets` secret** (App ID, webhook secret,
   private key).
4. **Apply** `kubectl apply -f github-app/k8s/` — Deployment + Service + Ingress
   at `/underscore-app`. Env carries the non-secret config the App writes into
   repos: `UNDERSCORE_VIEWER_URL`, `INTENT_DRIFT_URL`,
   `UNDERSCORE_ACTION_REF=logPhase/underscore-ci@v2`.
5. **Install the App** on the target org/repos. On install it opens a PR adding
   `.github/workflows/underscore.yml` (action-form caller) and sets
   `UNDERSCORE_VIEWER_URL` + `INTENT_DRIFT_URL`. Merge the PR to finish.

### Verify
- `GET /underscore-app/healthz` → `configured: true` (all creds present).
- Installing on a test repo opens the "Add Underscore code analysis" PR
  idempotently (re-install is a no-op on repos that already have the workflow).
</content>

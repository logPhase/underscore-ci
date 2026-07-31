# How to deploy the viewer and the onboarding App

Stand up the two hosted ops components. Scope: the operational sequence and its verification. Non-scope: the topology and manifest values themselves ([deployment-viewer-and-app](../reference/deployment-viewer-and-app.md)); consult `viewer/k8s/README.md` and `github-app/README.md` for environment-specific values. Audience: whoever runs the cluster.

## The hosted viewer

nginx plus a git-sync sidecar serving a reports branch. New CI commits appear with no redeploy.

1. **Build and push the image.** From the repo root, build and push `…/underscore-viewer:dev` to your registry (see `viewer/README.md`).
2. **Create three secrets in the target namespace.**
   - `underscore-reports-git` — `GITSYNC_USERNAME` / `GITSYNC_PASSWORD` for the reports repo (a read-only PAT is enough).
   - `underscore-viewer-htpasswd` — the basic-auth file, mounted at `/etc/nginx/.htpasswd`.
   - `underscore-viewer-ask` — `ask-token.conf`, one `proxy_set_header Authorization "Bearer …";` line for the `/ask` relay.
   `viewer/k8s/secret.example.yaml` templates the first and third.
3. **Apply the manifests:** `kubectl apply -f viewer/k8s/` — the `underscore-viewer-nginx` ConfigMap, the Deployment (git-sync + nginx sharing an `emptyDir`), the Service and the Ingress. The ConfigMap **replaces** the image's baked nginx config, so anything you need in production must be in the ConfigMap, not in `viewer/nginx.conf`.
4. **Point CI at it.** Set the client repo variable `UNDERSCORE_VIEWER_URL` to the viewer's base URL (for example `https://…/underscore`). Each PR comment then links `…/reports/pr-<N>/underscore-report.html`.

To serve a **different source repo**, regenerate the `*-iris.yaml` variant rather than hand-editing it — its header says so, and the deployment identity and synced repo are the only intended differences.

### Verify

- `/healthz` returns 200 immediately; `/readyz` returns 200 only after git-sync has landed `index.html` (503 "syncing" before that).
- The landing page loads. After the first publish it is the SPA hub booting from `repo-manifest.json`; before any publish there is nothing to serve.
- From a report page served over http(s), the **Ask** panel appears; from a downloaded artifact it does not.
- A fresh CI publish shows up within one sync period (60 s) with no redeploy.

## The onboarding GitHub App

The App opens a PR wiring the workflow into a newly installed repo.

1. **Build and push** `…/underscore-app:dev` (see `github-app/README.md`).
2. **Register the App** from `github-app/app-manifest.json` — permissions `contents`, `pull_requests`, `workflows`, `secrets`, `actions` (write) and `metadata` (read); events `installation` and `installation_repositories`; webhook `…/underscore-app/webhook`.
3. **Create Secret `underscore-app-secrets`** with `GH_APP_ID`, `GH_WEBHOOK_SECRET` and `GH_APP_PRIVATE_KEY`.
4. **Apply** `kubectl apply -f github-app/k8s/` — Deployment, Service and Ingress at `/underscore-app`. The Deployment's plain env carries what the App writes into client repos: `UNDERSCORE_VIEWER_URL`, `INTENT_DRIFT_URL` and `UNDERSCORE_ACTION_REF`.
5. **Install the App** on the target org or repos. Each install opens a PR adding `.github/workflows/underscore.yml` (the action-form caller) and sets the repo's `UNDERSCORE_VIEWER_URL` variable and `INTENT_DRIFT_URL` secret. Merging the PR finishes onboarding.
6. **Add `INTENT_DRIFT_TOKEN` yourself.** The App deliberately never sets it, so enrichment stays off until someone issues a token for that client.

### Verify

- `GET /underscore-app/healthz` returns `configured: true` — that means App ID, webhook secret and private key are all present.
- Installing on a test repo opens the "Add Underscore code analysis" PR, and re-installing is a no-op on repos that already have the workflow.
- If the variable or secret writes fail, the PR still opens — check the logs for the warning rather than assuming nothing ran.

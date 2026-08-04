# Reference — viewer & github-app deployment

The two hosted ops components. Neither runs analysis; both are glue around the
CI action. How-to: [deploy-the-viewer](../how-to/deploy-the-viewer.md).

## Hosted viewer (`viewer/`)

A **pure static nginx server** that serves pre-rendered reports. No analysis
backend, no IP — the self-contained HTML reports are produced in client CI and
committed to the `underscore-reports` branch; the viewer just serves that branch.

### Content contract (the reports branch)
- `index.html` — landing page / run index, regenerated each run.
- `latest/underscore-report.html` — overwritten each run (stable "newest" link).
- `reports/<UTC-stamp>-run-<n>/underscore-report.html` — immutable per-run report.

### The landing page (`viewer/index.html`)
logPhase-branded "analysis sessions" board. On load fetches `./viewers.json`
(optional `{name, href}` sources); if present it aggregates each source's
`runs.json` into one board, else reads `./runs.json`. Each row links to
`<dir>/underscore-report.html` with PR title / whole-repo ref, findings/journey/
flow counts, relative time, a "PR ↗" jump. No `runs.json` yet → honest
"written by the next Underscore run" message.

### nginx (`viewer/nginx.conf`) — three gotchas it's built around
1. git-sync serves through an atomically-swapped symlink → `open_file_cache`
   **off**, `disable_symlinks` **off** (else stale reports / 404s).
2. Path-derived cache: `reports/<stamp>/` → 1-year `immutable`; `index.html` +
   `latest/` → `no-cache`.
3. `add_header` doesn't merge across levels → all security + Cache-Control
   headers come from one server-level block. Port 8080 (non-root).

### K8s topology (`viewer/k8s/`)
`deployment.yaml`: two containers sharing one `emptyDir` at
`/usr/share/nginx/html`:
- **git-sync** `registry.k8s.io/git-sync/git-sync:v4.4.0` — `GITSYNC_LINK=current`,
  `GITSYNC_REF=underscore-reports`, `GITSYNC_REPO=…/apcoa-tech/iris-vas`, 60s
  period, private-repo auth from `underscore-reports-git` secret.
- **nginx** `irisacrdev001.azurecr.io/underscore-viewer:dev` — config from the
  `underscore-viewer-nginx` ConfigMap (fully replaces the baked config), docroot
  `/usr/share/nginx/html/current` (the git-sync symlink).

Production deltas the ConfigMap adds over the image's own config:
- **basic auth** (htpasswd from `underscore-viewer-htpasswd` secret);
- `/healthz` (always-200 liveness), `/readyz` (200 only after `index.html` syncs);
- **`/ask` relay** (the only dynamic route) — proxies POSTs to
  `https://intent-analyzer.logphase.ai/bpmn/ask` with a server-injected token
  from `underscore-viewer-ask`.

Exposed by `service.yaml` (ClusterIP :80) + `ingress.yaml` (Azure App Gateway,
path `/underscore` on `iris-ingest-dev.apcoaflow.com`, prefix stripped).
`replicas: 2`. A second generated deployment (`deployment-iris.yaml` +
`*-iris.yaml`) serves a different source repo (`apcoa-tech/iris`) at
`/iris-underscore` — regenerate, don't hand-edit.

## Onboarding GitHub App (`github-app/`)

A GitHub App that makes onboarding a repo one action: **install → merge the PR
it opens** (CodeRabbit-style). It does **not** run analysis — that stays in
client CI via the action. It is the provisioning/glue layer.

### On install (`app.py`)
On `installation` (created/added) or `installation_repositories` (added), for
each selected repo it:
1. Opens a PR adding `.github/workflows/underscore.yml` — the **action-form**
   caller (`uses: logPhase/underscore-ci@v2`, `mode: auto`, `publish: branch`),
   portable across orgs that block external reusable workflows.
2. Sets the repo's `UNDERSCORE_VIEWER_URL` variable and `INTENT_DRIFT_URL` secret.

### Logic / endpoints (`app.py`)
- `_app_jwt()` — ≤9-min RS256 JWT; `_installation_token()` — per-installation
  token scoped to granted repos.
- `_set_repo_variable()` (create/patch), `_set_repo_secret()` (libsodium sealed
  box), `onboard_repo()` — idempotent (skips repos already having the workflow,
  reuses the `underscore/onboard` branch, opens PR "Add Underscore code analysis").
- `POST /webhook` — HMAC-SHA256 verify (`X-Hub-Signature-256`, constant-time) →
  dispatch.
- `GET /healthz` — `configured: true` once App ID + webhook secret + private key
  are present. `GET /` — status landing page.
- Mounted under `/underscore-app` (parent `root = FastAPI()` mounts `app`)
  because the shared App Gateway forwards the path unchanged. `uvicorn app:root`
  on 8080.

Permissions (`app-manifest.json`): `contents:write`, `pull_requests:write`,
`workflows:write`, `secrets:write`, `actions:write`, `metadata:read`; events
`installation`, `installation_repositories`. Webhook
`https://iris-ingest-dev.apcoaflow.com/underscore-app/webhook`.

### K8s (`github-app/k8s/deployment.yaml`)
Image `irisacrdev001.azurecr.io/underscore-app:dev` (Python 3.13-slim, uid
10001). Deployment (1 replica) + ClusterIP Service + Ingress at
`/underscore-app` on the shared host. Non-secret config it writes into repos
comes from env (`UNDERSCORE_VIEWER_URL`, `INTENT_DRIFT_URL`,
`UNDERSCORE_ACTION_REF=logPhase/underscore-ci@v2`); GH App credentials from the
`underscore-app-secrets` secret. Liveness/readiness on `/underscore-app/healthz`.

## The two client-facing workflow forms

| Form | Committed by | Shape |
|---|---|---|
| **Reusable-workflow caller** | client copies `examples/underscore.yml` | `uses: logPhase/underscore-ci/.github/workflows/underscore.yml@v2` |
| **Action-form caller** | the GitHub App | `uses: logPhase/underscore-ci@v2` directly |

Same behavior; the action form is more portable (some orgs block external
reusable workflows). This repo's own `.github/workflows/underscore.yml` **is**
the reusable workflow (`on: workflow_call`) — there is no image-build/publish
workflow committed; the viewer/app images are built and pushed manually.
</content>

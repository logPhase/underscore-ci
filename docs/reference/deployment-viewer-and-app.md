# Reference — viewer and GitHub App deployment

The two hosted ops components: what they are made of and what the manifests actually declare. Neither runs analysis. Scope: the deployed topology as committed in `viewer/` and `github-app/`. Non-scope: the operational sequence — see [deploy-the-viewer](../how-to/deploy-the-viewer.md). Audience: whoever operates or re-points these deployments.

## Hosted viewer (`viewer/`)

A pure static nginx server for reports produced in client CI and committed to a reports branch. No analysis backend, no IP.

### The reports branch is the content contract

`scripts/publish-report.sh` and `entrypoint.sh` are the authority for what lands on the branch:

| Path | Written by | Mutability |
|---|---|---|
| `index.html` | the staged `underscore-hub.html` (SPA hub shell), falling back to the bundled `viewer/index.html` board | rewritten every publish |
| `repo-manifest.json` | publish step | rewritten every publish; `architecture`/`specs` refreshed only by `full` runs |
| `runs.json` | publish step | upserted by PR in `pr` mode, appended in `full` mode |
| `reports/pr-<N>/underscore-report.html` | `pr` mode | replaced on every push to the PR |
| `reports/<UTC-stamp>-run-<n>/underscore-report.html` | `full` mode | immutable |
| `latest/underscore-report.html` | `full` mode | overwritten every full run |
| `.nojekyll` | publish step | always present |

`viewer/README.md`'s own contract table predates the hub and lists only `index.html`, `latest/` and the stamped run dirs — treat the table above as current.

### The nginx config exists twice, and the deployed one is the ConfigMap

The image bakes `viewer/nginx.conf`; the Kubernetes ConfigMap `underscore-viewer-nginx` (defined inline in `viewer/k8s/deployment.yaml`) **fully replaces** it at `/etc/nginx/conf.d/default.conf`. They differ in ways that matter when debugging:

| | Baked `viewer/nginx.conf` | ConfigMap (deployed) |
|---|---|---|
| Port | 8080 (unprivileged) | 80, matching `containerPort: 80` |
| Docroot | `/usr/share/nginx/html` (git-sync flips that path itself, `--link=html`) | `/usr/share/nginx/html/current` (`GITSYNC_LINK=current`) |
| Auth | none | basic auth, htpasswd from Secret `underscore-viewer-htpasswd` |
| Probes | `location = /` only | `/healthz` (always 200) and `/readyz` (200 only once `index.html` exists, else 503) |
| Dynamic routes | none | `/ask` relay |
| Cache map | default 300 s; `/reports/` immutable 1 y; `/latest/`, `/index.html`, `/` no-cache | same, plus `/runs.json` no-cache |

Three gotchas both configs are built around: `open_file_cache` stays **off** (caching a resolved fd would pin nginx to the pre-swap revision and serve stale reports); `disable_symlinks` stays **off** (turning it on makes nginx refuse git-sync's symlink and 404 everything); and every security and `Cache-Control` header is emitted from one server-level `add_header` block, because `add_header` does not merge across nesting levels. No CSP is set — single-file reports are inline JS and CSS by construction.

The `/ask` relay is the only dynamic route: POST-only, 1 MB body cap, proxying to `https://intent-analyzer.logphase.ai/bpmn/ask` with a 180 s read timeout. The bearer header comes from an nginx `include` of `/etc/nginx/ask-secret/ask-token.conf`, supplied by Secret `underscore-viewer-ask`, so the token never appears in the ConfigMap or in git.

### Kubernetes topology (`viewer/k8s/`)

`deployment.yaml` runs **2 replicas** of two containers sharing an `emptyDir` mounted at `/usr/share/nginx/html` (git-sync read-write, nginx read-only), with pod `fsGroup: 65533`:

- **git-sync** `registry.k8s.io/git-sync/git-sync:v4.4.0` — `GITSYNC_REPO=https://github.com/apcoa-tech/iris-vas`, `GITSYNC_REF=underscore-reports`, `GITSYNC_ROOT=/usr/share/nginx/html`, `GITSYNC_LINK=current`, `GITSYNC_PERIOD=60s`, `GITSYNC_DEPTH=1`, `GITSYNC_MAX_FAILURES=-1`, `GITSYNC_SYNC_TIMEOUT=120s`; credentials from Secret `underscore-reports-git`. It runs non-root (65533) with a read-only root filesystem and all capabilities dropped.
- **nginx** `irisacrdev001.azurecr.io/underscore-viewer:dev` — config from the ConfigMap, htpasswd and ask-token secrets mounted in.

`service.yaml` is a ClusterIP on port 80. `ingress.yaml` uses `ingressClassName: azure-application-gateway` with TLS host `iris-ingest-dev.apcoaflow.com` (secret `apcoaflow-tls`) and path `/underscore` — a deliberate path-share of an already-resolving host, so no new DNS record or certificate is needed. `secret.example.yaml` templates `underscore-reports-git` and `underscore-viewer-ask`.

The `*-iris.yaml` trio is a **generated** second deployment of the same image for a different source repo (`apcoa-tech/iris`), served at path `/iris-underscore`, sharing the same three secrets. Its header comment says to regenerate rather than hand-edit — and note the comment's stated path (`/underscore-iris`) does not match the manifest's actual `/iris-underscore`.

### The landing board (`viewer/index.html`)

Used only as the fallback landing page now that publishes ship the hub shell. It fetches `./viewers.json` (`no-store`) and, if that yields entries, aggregates each source's `runs.json` into one board; otherwise it reads a single `./runs.json`. Each row links to `<source>/<dir>/underscore-report.html` and shows the session id, PR title or whole-repo ref, a `LATEST` tag on the newest row, a findings badge when non-zero, journey/BPMN counts, a `PR ↗` chip, and a relative timestamp. With no `runs.json` it says so honestly ("written by the next Underscore run"); with sources but no rows it invites opening a pull request; a single failed source degrades to one quiet per-source note.

## Onboarding GitHub App (`github-app/`)

A FastAPI app that makes onboarding one action: install it, merge the PR it opens. It never runs analysis.

### What it does on install

On `installation` (`created`/`added`) or `installation_repositories` (`added`), for each selected repo `onboard_repo()`:

1. skips with `already-onboarded` if `.github/workflows/underscore.yml` exists;
2. otherwise creates or force-resets branch `underscore/onboard` off the default branch and commits that one file (message `ci: add Underscore analysis workflow`);
3. best-effort sets the repo **variable** `UNDERSCORE_VIEWER_URL` and the repo **secret** `INTENT_DRIFT_URL` (libsodium sealed box against the repo's public key) — failures here only log, the PR still opens;
4. opens the PR "Add Underscore code analysis".

The committed workflow is the **action form** — `uses: logPhase/underscore-ci@v2` with `mode: auto`, `publish: branch` and `viewer-url: ${{ vars.UNDERSCORE_VIEWER_URL }}`, plus `actions/checkout@v4` at `fetch-depth: 0` and `contents: write` + `pull-requests: write`. That form is portable across orgs that block external reusable workflows. The ref comes from `UNDERSCORE_ACTION_REF` (default `logPhase/underscore-ci@v2`). The app never sets `INTENT_DRIFT_TOKEN`; the PR body tells the client to add it to enable enrichment.

### Endpoints and identity

`_app_jwt()` mints a ≤9-minute RS256 JWT; `_installation_token()` exchanges it for a per-installation token. `POST /webhook` verifies `X-Hub-Signature-256` with a constant-time HMAC-SHA256 (401 on mismatch, 500 when no webhook secret is configured) before dispatching. `GET /healthz` reports `configured: true` once App ID, webhook secret and private key are all present. `GET /` is a status page.

The app mounts itself: an inner FastAPI `app` is mounted at `/underscore-app` on a parent `root`, because the shared App Gateway's path rewrite is unreliable where the prefix overlaps the viewer's `/underscore`. The container serves `uvicorn app:root --port 8080`.

`app-manifest.json` requests `contents:write`, `pull_requests:write`, `workflows:write`, `secrets:write`, `actions:write`, `metadata:read`, subscribes to `installation` and `installation_repositories`, is non-public, and points its webhook at `https://iris-ingest-dev.apcoaflow.com/underscore-app/webhook`.

### Kubernetes topology (`github-app/k8s/`)

One replica of `irisacrdev001.azurecr.io/underscore-app:dev` (`imagePullPolicy: Always`, non-root uid 10001, port 8080). Plain env supplies what the app writes into client repos: `UNDERSCORE_VIEWER_URL=https://iris-ingest-dev.apcoaflow.com/underscore`, `INTENT_DRIFT_URL=https://intent-analyzer.logphase.ai`, `UNDERSCORE_ACTION_REF=logPhase/underscore-ci@v2`. `GH_APP_ID`, `GH_WEBHOOK_SECRET` and `GH_APP_PRIVATE_KEY` come from Secret `underscore-app-secrets`. Both probes hit `/underscore-app/healthz`. A ClusterIP Service on port 80 sits behind an Ingress at path `/underscore-app` on the same shared host — again a path-share, so no new DNS.

## The two client-facing workflow forms

| Form | Committed by | Shape |
|---|---|---|
| Reusable-workflow caller | the client copying `examples/underscore.yml` | `uses: logPhase/underscore-ci/.github/workflows/underscore.yml@v2` |
| Action-form caller | the GitHub App | `uses: logPhase/underscore-ci@v2` |

Behavior is the same; the action form is more portable and exposes the action's full input set. This repo's own `.github/workflows/underscore.yml` **is** the reusable workflow — there is no image-build or publish workflow committed here, and the viewer and app images are built and pushed by hand.

# Underscore onboarding GitHub App

A GitHub App that makes onboarding a repo one action: **install → merge the PR it opens.**
It does not run analysis (that stays in the client's CI via the action) — it is the
frictionless glue, CodeRabbit-style.

On `installation` / `installation_repositories`, for each selected repo it:
1. opens a PR adding `.github/workflows/underscore.yml` (the action-form caller), and
2. sets the repo's `UNDERSCORE_VIEWER_URL` variable + `INTENT_DRIFT_URL` secret.

Merge the PR and Underscore runs on every pull request. (Set `INTENT_DRIFT_TOKEN`
to enable enrichment — the app can be extended to mint + set that per client.)

## Security
- Webhooks verified with HMAC-SHA256 (`X-Hub-Signature-256`), constant-time compare.
- App auth: short-lived RS256 JWT → per-installation token scoped to granted repos.
- Repo secrets written with libsodium sealed boxes. No secret/token is logged.

## Setup (one-time)

**1. Deploy the server** (already on the shared `iris` AKS cluster):
```bash
docker build --platform linux/amd64 -t irisacrdev001.azurecr.io/underscore-app:dev .
docker push irisacrdev001.azurecr.io/underscore-app:dev
kubectl apply -n iris -f k8s/deployment.yaml   # runs, "awaiting credentials"
```
It serves at `https://iris-ingest-dev.apcoaflow.com/underscore-app/` (webhook: `/underscore-app/webhook`).

**2. Register the GitHub App** (the one human step GitHub requires). Create it under
the `logPhase` org → Settings → Developer settings → GitHub Apps → New, using
`app-manifest.json` for the permissions/events/webhook URL, OR open the pre-filled
creation page and click **Create**. Then: generate a private key (downloads a PEM),
and note the App ID + the Webhook secret you set.

**3. Wire the credentials** into the running server:
```bash
kubectl create secret generic underscore-app-secrets -n iris \
  --from-literal=GH_APP_ID='<app id>' \
  --from-literal=GH_WEBHOOK_SECRET='<webhook secret>' \
  --from-file=GH_APP_PRIVATE_KEY=<downloaded-private-key>.pem
kubectl rollout restart deployment/underscore-app -n iris
```
`GET /underscore-app/healthz` should then report `"configured": true`.

**4. Install** the app on a repo → watch it open the "Add Underscore code analysis" PR.

## Permissions the app requests
contents:write, pull_requests:write, workflows:write, secrets:write, actions:write, metadata:read.
Events: installation, installation_repositories.

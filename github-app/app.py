"""Underscore onboarding GitHub App — a provisioning bot.

Underscore's analysis runs in the client's OWN CI (the logPhase/underscore-ci
action), so a client's code never leaves their runner. This app is NOT where
analysis runs — it is the frictionless onboarding + glue layer, CodeRabbit-style:

  install the app on a repo  ->  it opens a PR adding the 10-line
  `.github/workflows/underscore.yml`, and sets the repo's UNDERSCORE_VIEWER_URL
  variable + INTENT_DRIFT_URL secret.

Merge that PR and Underscore runs on every pull request — no YAML to copy, no
secrets to paste by hand.

Security notes:
  - Every webhook is verified with an HMAC-SHA256 signature (X-Hub-Signature-256)
    against WEBHOOK_SECRET, compared in constant time.
  - App auth mints a short-lived (<=9 min) RS256 JWT from the app private key,
    exchanged for a per-installation token scoped to only the granted repos.
  - Repo secrets are written with libsodium sealed boxes (GitHub's required
    encryption); the plaintext INTENT_DRIFT_URL never appears in logs.
  - No token, key, or secret is ever logged.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time

import httpx
import jwt
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from nacl import encoding, public

log = logging.getLogger("underscore-app")
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO").upper(),
                    format="%(asctime)s %(levelname)s %(name)s %(message)s")

GH_API = "https://api.github.com"

APP_ID = os.environ.get("GH_APP_ID", "")
WEBHOOK_SECRET = os.environ.get("GH_WEBHOOK_SECRET", "").encode()
# Private key: PEM via GH_APP_PRIVATE_KEY, or a file path via GH_APP_PRIVATE_KEY_FILE.
_PK = os.environ.get("GH_APP_PRIVATE_KEY", "")
if not _PK and os.environ.get("GH_APP_PRIVATE_KEY_FILE"):
    with open(os.environ["GH_APP_PRIVATE_KEY_FILE"]) as f:
        _PK = f.read()
PRIVATE_KEY = _PK

# Config the app writes into each onboarded repo.
VIEWER_URL = os.environ.get("UNDERSCORE_VIEWER_URL", "")
INTENT_DRIFT_URL = os.environ.get("INTENT_DRIFT_URL", "")
ACTION_REF = os.environ.get("UNDERSCORE_ACTION_REF", "logPhase/underscore-ci@v2")
WORKFLOW_PATH = ".github/workflows/underscore.yml"

app = FastAPI(title="Underscore onboarding app", version="0.1.0")


def _workflow_yaml() -> str:
    """The tiny caller the app commits — the action-form (portable across org
    policies that block external reusable workflows)."""
    return f"""# Added by the Underscore GitHub App. Underscore analyzes each PR
# (only the journeys it touches) and, on manual dispatch, the whole repo.
name: Underscore
on: [pull_request, workflow_dispatch]

jobs:
  underscore:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: {ACTION_REF}
        with:
          mode: auto
          publish: branch
          viewer-url: ${{{{ vars.UNDERSCORE_VIEWER_URL }}}}
        env:
          GITHUB_TOKEN: ${{{{ secrets.GITHUB_TOKEN }}}}
          INTENT_DRIFT_URL: ${{{{ secrets.INTENT_DRIFT_URL }}}}
          INTENT_DRIFT_TOKEN: ${{{{ secrets.INTENT_DRIFT_TOKEN }}}}
"""


# ── GitHub App auth ──────────────────────────────────────────────────────
def _app_jwt() -> str:
    now = int(time.time())
    return jwt.encode({"iat": now - 30, "exp": now + 540, "iss": APP_ID},
                      PRIVATE_KEY, algorithm="RS256")


async def _installation_token(client: httpx.AsyncClient, installation_id: int) -> str:
    r = await client.post(
        f"{GH_API}/app/installations/{installation_id}/access_tokens",
        headers={"Authorization": f"Bearer {_app_jwt()}",
                 "Accept": "application/vnd.github+json"})
    r.raise_for_status()
    return r.json()["token"]


def _gh(token: str) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=GH_API, timeout=30,
        headers={"Authorization": f"token {token}",
                 "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28"})


# ── provisioning ─────────────────────────────────────────────────────────
async def _set_repo_variable(c: httpx.AsyncClient, repo: str, name: str, value: str) -> None:
    # create, or update if it already exists
    r = await c.post(f"/repos/{repo}/actions/variables", json={"name": name, "value": value})
    if r.status_code == 409:
        await c.patch(f"/repos/{repo}/actions/variables/{name}", json={"name": name, "value": value})


async def _set_repo_secret(c: httpx.AsyncClient, repo: str, name: str, value: str) -> None:
    pk = (await c.get(f"/repos/{repo}/actions/secrets/public-key")).json()
    sealed = public.SealedBox(public.PublicKey(pk["key"].encode(), encoding.Base64Encoder))
    enc = base64.b64encode(sealed.encrypt(value.encode())).decode()
    await c.put(f"/repos/{repo}/actions/secrets/{name}",
                json={"encrypted_value": enc, "key_id": pk["key_id"]})


async def onboard_repo(token: str, repo: str) -> dict:
    """Open the workflow PR + set config. Idempotent: skips repos that already
    have the workflow, and reuses the onboarding branch if present."""
    async with _gh(token) as c:
        # already onboarded?
        exists = await c.get(f"/repos/{repo}/contents/{WORKFLOW_PATH}")
        if exists.status_code == 200:
            return {"repo": repo, "status": "already-onboarded"}

        info = (await c.get(f"/repos/{repo}")).json()
        default_branch = info["default_branch"]
        base_sha = (await c.get(f"/repos/{repo}/git/ref/heads/{default_branch}")).json()["object"]["sha"]
        branch = "underscore/onboard"
        # create (or reset) the onboarding branch
        mk = await c.post(f"/repos/{repo}/git/refs",
                          json={"ref": f"refs/heads/{branch}", "sha": base_sha})
        if mk.status_code == 422:  # branch exists
            await c.patch(f"/repos/{repo}/git/refs/heads/{branch}",
                          json={"sha": base_sha, "force": True})

        content = base64.b64encode(_workflow_yaml().encode()).decode()
        await c.put(f"/repos/{repo}/contents/{WORKFLOW_PATH}",
                    json={"message": "ci: add Underscore analysis workflow",
                          "content": content, "branch": branch})

        # best-effort config; never block the PR on it
        try:
            if VIEWER_URL:
                await _set_repo_variable(c, repo, "UNDERSCORE_VIEWER_URL", VIEWER_URL)
            if INTENT_DRIFT_URL:
                await _set_repo_secret(c, repo, "INTENT_DRIFT_URL", INTENT_DRIFT_URL)
        except Exception:  # noqa: BLE001
            log.warning("config provisioning for %s hit an issue (PR still opened)", repo)

        pr = await c.post(f"/repos/{repo}/pulls", json={
            "title": "Add Underscore code analysis",
            "head": branch, "base": default_branch,
            "body": ("This PR (opened by the Underscore app) adds a PR-scoped "
                     "code-analysis workflow. Merge it and Underscore runs on "
                     "every pull request. Set the `INTENT_DRIFT_TOKEN` secret to "
                     "enable enrichment (BPMN + summaries).")})
        pr_url = pr.json().get("html_url", "") if pr.status_code < 300 else ""
        return {"repo": repo, "status": "pr-opened", "pr": pr_url}


# ── webhook ──────────────────────────────────────────────────────────────
def _verify(sig: str | None, body: bytes) -> None:
    if not WEBHOOK_SECRET:
        raise HTTPException(500, "app not configured (no webhook secret)")
    expected = "sha256=" + hmac.new(WEBHOOK_SECRET, body, hashlib.sha256).hexdigest()
    if not sig or not hmac.compare_digest(sig, expected):
        raise HTTPException(401, "bad signature")


@app.post("/webhook")
async def webhook(request: Request,
                  x_github_event: str = Header(default=""),
                  x_hub_signature_256: str | None = Header(default=None)):
    body = await request.body()
    _verify(x_hub_signature_256, body)
    payload = json.loads(body or b"{}")
    action = payload.get("action")

    # Onboard on install, and when repos are added to an existing installation.
    repos: list[str] = []
    if x_github_event == "installation" and action in ("created", "added"):
        repos = [r["full_name"] for r in payload.get("repositories", [])]
        inst_id = payload["installation"]["id"]
    elif x_github_event == "installation_repositories" and action == "added":
        repos = [r["full_name"] for r in payload.get("repositories_added", [])]
        inst_id = payload["installation"]["id"]
    else:
        return {"ok": True, "ignored": f"{x_github_event}.{action}"}

    async with httpx.AsyncClient(timeout=30) as c:
        token = await _installation_token(c, inst_id)
    results = []
    for repo in repos:
        try:
            results.append(await onboard_repo(token, repo))
        except Exception as ex:  # noqa: BLE001
            log.warning("onboarding %s failed: %s", repo, type(ex).__name__)
            results.append({"repo": repo, "status": "error"})
    log.info("onboarded %d repo(s): %s", len(results),
             ", ".join(f"{r['repo']}={r['status']}" for r in results))
    return {"ok": True, "results": results}


@app.get("/healthz")
async def healthz():
    return JSONResponse({"status": "ok",
                         "configured": bool(APP_ID and WEBHOOK_SECRET and PRIVATE_KEY)})


@app.get("/")
async def landing():
    ok = bool(APP_ID and WEBHOOK_SECRET and PRIVATE_KEY)
    return HTMLResponse(f"""<!doctype html><meta charset=utf-8>
<title>Underscore — onboarding app</title>
<style>body{{font:16px/1.6 system-ui,sans-serif;max-width:40rem;margin:12vh auto;padding:0 1.5rem;color:#1c1c28}}
code{{background:#f2f2f7;padding:.1em .4em;border-radius:4px}}.s{{color:{'#0a7' if ok else '#c33'}}}</style>
<h1>Underscore onboarding app</h1>
<p>Install this GitHub App on a repository and it opens a pull request adding a
PR-scoped code-analysis workflow — no YAML to copy.</p>
<p>Status: <b class=s>{'configured' if ok else 'awaiting credentials'}</b></p>""")


# ── path-prefix mount ─────────────────────────────────────────────────────
# Served behind the shared App Gateway host at /underscore-app/*. The gateway's
# prefix path overlaps the viewer's (/underscore), so its path-rewrite is
# unreliable — instead the app OWNS the full prefix by mounting `app` under it.
# The gateway forwards the path unchanged; this parent routes /underscore-app/*
# to the real app (which then sees /webhook, /healthz, /). uvicorn serves `root`.
root = FastAPI()
root.mount("/underscore-app", app)

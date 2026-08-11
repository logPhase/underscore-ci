# CLAUDE.md

Instructions for working in this repo. Full docs map: **[docs/README.md](docs/README.md)** — read it before touching anything non-trivial; this file only covers what you'd otherwise get wrong.

## What's here

One repo, three deliverables, don't conflate them:

- **root** (`src/`, `action.yml`, `entrypoint.sh`, `Dockerfile`, `scripts/`) — the GitHub Action pack: a React report renderer + the composite Action that runs the analysis image in client CI.
- **`viewer/`** — separate static nginx image that hosts published reports. Own `Dockerfile`/`nginx.conf`, no `package.json`, not built by root `pnpm` scripts.
- **`github-app/`** — separate Python/FastAPI onboarding app (own `Dockerfile`/`requirements.txt`). Not built or run by anything at root.

The analysis backend (Clojure + Roslyn, the actual IP) is **not in this repo** — it lives in the sibling `underscore-desktop` checkout.

## Commands (root — the renderer + Action pack)

```bash
pnpm install          # Node >= 24 required (package.json engines — enforced, not a suggestion)
pnpm dev              # Vite dev server; needs a payload — see docs/how-to/develop-the-renderer.md
pnpm typecheck
pnpm test             # vitest run
pnpm build            # -> report-dist/ (multi-file)
pnpm build:singlefile # -> the single-file HTML template clients actually receive
```

## Building the analysis image

`scripts/build-image.sh [desktop-dir]` builds `ghcr.io/logphase/underscore-ci:dev`. It **requires a sibling `underscore-desktop` checkout** (defaults to `$UNDERSCORE_DESKTOP_DIR`, then `../underscore-desktop`) to build the backend uberjar and Roslyn CLI — it fails fast if that checkout has no `backend/`. It also runs `pnpm build` + `pnpm build:singlefile` here. Details: [docs/how-to/build-and-push-the-image.md](docs/how-to/build-and-push-the-image.md).

## Running the container locally

Don't hand-roll the `docker run` invocation — copy it from [docs/how-to/run-the-container-locally.md](docs/how-to/run-the-container-locally.md); it documents the required env vars (`GITHUB_REPOSITORY` is mandatory under `set -u`) and the synthetic event payload format.

## Gotchas

- **`.docker-context/` is a staging directory, never commit it.** `scripts/build-image.sh` stages the backend uberjar and other build inputs there; it's gitignored for that reason.
- **Dev fixtures are real analysis exports — never commit them.** `public/pr-output.json` and `dev-runs/` are gitignored; a fixture is only produced locally by running the container ([run-the-container-locally](docs/how-to/run-the-container-locally.md)).
- **`viewer/nginx.conf` is not the deployed config.** The Kubernetes ConfigMap fully replaces it in the cluster, and the two differ in ways that matter — see [docs/reference/deployment-viewer-and-app.md](docs/reference/deployment-viewer-and-app.md) before editing either.
- The report renderer is a fork of the desktop renderer — never re-copy `src/` wholesale from there; it wipes report-mode-specific changes (see [develop-the-renderer](docs/how-to/develop-the-renderer.md)).

## Docs are living

`docs/` must stay true: if your change makes any doc there false, update or delete that doc in the same PR. Before creating or editing any doc (or this file), follow `.claude/skills/writing-docs/SKILL.md`. Run the `docs-audit` skill before releases.

## Everything else

Architecture, the three-repo split, entrypoint runtime behavior, action inputs/outputs, renderer internals: **[docs/README.md](docs/README.md)**.

# How to: build and push the analysis image

The analysis image bundles the backend CLI + Roslyn sidecar (**sourced from
underscore-desktop**) and this repo's built report renderer. Reference:
[scripts-and-image](../reference/scripts-and-image.md).

## Prerequisites
- A sibling **underscore-desktop** checkout (the backend + Roslyn live there —
  see [architecture-three-repos](../explanation/architecture-three-repos.md)).
- JDK 21+, Clojure CLI, .NET 10 SDK, pnpm, Docker.

## Build

```bash
# from the underscore-ci repo root
./scripts/build-image.sh [path-to-underscore-desktop]
# or: UNDERSCORE_DESKTOP_DIR=/path/to/underscore-desktop ./scripts/build-image.sh
```

This stages four artifacts into `.docker-context/` and builds
`ghcr.io/logphase/underscore-ci:dev` (linux/amd64):

| Artifact | Produced by |
|---|---|
| `underscore-cli.jar` | `clojure -T:build uber` (in the desktop checkout) |
| `roslyn-cli/` | framework-dependent `dotnet publish` (run in-container as `dotnet RoslynCli.dll <sln>`) |
| `report-dist/` | `pnpm build` (this repo) |
| `underscore-report.template.html` | `pnpm build:singlefile` (this repo) — carries the `__UNDERSCORE_REPORT_DATA__` marker |

Guards enforced by the script: no `report-dist/pr-output.json` may be baked in
(no client data in the distributable), and the singlefile HTML must contain the
marker.

## Tag & push a release

```bash
IMAGE_TAG=ghcr.io/logphase/underscore-ci:v2.0.0 ./scripts/build-image.sh
docker push ghcr.io/logphase/underscore-ci:v2.0.0
```

Clients pin a tag (`@v2`) via the `image` input / reusable workflow. Versioned
tags (`v2`, `v2.x.y`) are one of the monetization levers — access is per-client
and revocable (see [enrichment-and-privacy](../explanation/enrichment-and-privacy.md)).

## Test the built image

Point the action's `image` input at your dev tag, or run it directly against a
local repo — [run-the-container-locally](run-the-container-locally.md).

## Notes
- There is **no** image-build CI workflow in this repo — building is a
  maintainer step on your machine. Only the reusable workflow lives in
  `.github/workflows/`.
- The renderer is a **fork**; `build-image.sh` uses the desktop checkout only
  for the *backend*. The report it bundles is built from `src/` here.
</content>

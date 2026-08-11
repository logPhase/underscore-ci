# How to build and push the analysis image

The analysis image bundles the backend CLI and language parsers (sourced from underscore-desktop) with this repo's built report renderer. Scope: the build, tag and push sequence. Non-scope: what each layer and guard is ([scripts-and-image](../reference/scripts-and-image.md)). Audience: maintainers shipping an image to clients.

## Prerequisites

- A sibling **underscore-desktop** checkout — the backend and the parsers live there ([architecture-three-repos](../explanation/architecture-three-repos.md)).
- JDK 21+, the Clojure CLI, the .NET 10 SDK, pnpm with Node ≥ 24, and Docker.

## Build

```bash
# from the underscore-ci repo root
./scripts/build-image.sh /path/to/underscore-desktop
# or: UNDERSCORE_DESKTOP_DIR=/path/to/underscore-desktop ./scripts/build-image.sh
```

With no argument the script falls back to `$UNDERSCORE_DESKTOP_DIR`, then to `../underscore-desktop`, and exits if that path has no `backend/`.

It stages five artifacts into `.docker-context/` and builds `ghcr.io/logphase/underscore-ci:dev` for `linux/amd64`:

| Artifact | Produced by |
|---|---|
| `underscore-cli.jar` | `clojure -T:build uber` in the desktop checkout |
| `roslyn-cli/` | `dotnet publish` of `backend/tools/roslyn-cli` (run in-container as `dotnet RoslynCli.dll`) |
| `report-dist/` | `pnpm build` here |
| `underscore-report.template.html` | `pnpm build:singlefile` here — carries the `__UNDERSCORE_REPORT_DATA__` marker |

The script enforces two guards and fails the build on either: no `report-dist/pr-output.json` may be staged (never ship client analysis data), and the singlefile HTML must still contain the marker. The platform is pinned to `linux/amd64` so a build on Apple Silicon cannot ship unrunnable to GitHub-hosted runners.

## Tag and push a release

```bash
IMAGE_TAG=ghcr.io/logphase/underscore-ci:v2.0.0 ./scripts/build-image.sh /path/to/underscore-desktop
docker push ghcr.io/logphase/underscore-ci:v2.0.0
```

The script never pushes; it prints the push command. Clients run whatever the pinned tag resolves to — the action defaults to `ghcr.io/logphase/underscore-ci:v2`, and image access is granted per client and revocable.

## Test the built image

Point the action's `image` input at your dev tag, or run the image directly against a local repo — [run-the-container-locally](run-the-container-locally.md).

The reusable workflow does **not** forward an `image` input, so dogfooding a `:dev` tag means calling the action directly (`uses: logPhase/underscore-ci@v2` with `image: …:dev`).

## Notes

- There is no image-build workflow in this repo. Building is a maintainer step on your own machine; the only committed workflow is the reusable one clients call.
- `build-image.sh` uses the desktop checkout **only** for the backend and parsers. The report it bundles is always built from `src/` here.

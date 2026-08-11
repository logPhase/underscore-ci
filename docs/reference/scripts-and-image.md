# Reference — scripts and the analysis image

Every script in `scripts/` and every layer of the [`Dockerfile`](../../Dockerfile), split by **build-time** (run once to produce the image) versus **CI-time** (run on every analysis). Scope: what each artifact is and what guards it enforces. Non-scope: how to invoke them — see [build-and-push-the-image](../how-to/build-and-push-the-image.md). Audience: maintainers of the image and the publish pipeline.

## Build-time versus CI-time at a glance

| Script | When | Where it runs |
|---|---|---|
| `build-image.sh` | build-time | maintainer machine (needs a desktop checkout, JDK/Clojure/.NET/pnpm/Docker) |
| `build-singlefile.mjs` | build-time | via `pnpm build:singlefile` |
| `inject-report-data.mjs` | CI-time | inside the container, `artifact` delivery only |
| `publish-report.sh` | CI-time | on the runner (has git and push credentials) |
| `retire-report.sh` | CI-time | on the runner |

## The image

| Layer | Detail |
|---|---|
| Base | `eclipse-temurin:21-jre` |
| apt | `git` (worktree diffing), `jq` (payload parsing), `curl`, `ca-certificates`, `nodejs` (runs the injector), and `gh` from the cli.github.com apt repo (comment upsert, findings review) |
| .NET | .NET 10 SDK installed by `dotnet-install.sh --channel 10.0` into `/usr/share/dotnet`; the install script is kept at `/usr/local/bin/dotnet-install.sh` so the backend can lazily add SDK versions a client repo pins |
| ENV (.NET) | `DOTNET_ROOT`, `DOTNET_INSTALL_SCRIPT`, telemetry/nologo/first-run opt-outs; `PATH` prepends `DOTNET_ROOT` |
| ENV (backend) | `UNDERSCORE_MODE=container`, `UNDERSCORE_IN_CONTAINER=1`, `UNDERSCORE_ROSLYN_CLI=/opt/underscore/roslyn-cli/RoslynCli.dll` (DLL mode — no in-container build), `UNDERSCORE_RUNS_DIR=/tmp/underscore/runs` |
| COPY from `.docker-context/` | `underscore-cli.jar`, `roslyn-cli/`, `report-dist/`, `underscore-report.template.html` → under `/opt/underscore/` |
| COPY from the repo | `scripts/inject-report-data.mjs` → `/opt/underscore/scripts/`, `entrypoint.sh` → `/entrypoint.sh` (chmod +x) |
| Entrypoint | `ENTRYPOINT ["/entrypoint.sh"]`, with the OCI source `LABEL` last on purpose — a metadata-only layer keeps everything above cache-stable |

## `scripts/build-image.sh` — build-time

Builds the image from a sibling `underscore-desktop` checkout, resolved from the first argument, else `UNDERSCORE_DESKTOP_DIR`, else `../underscore-desktop`; it exits with usage if that path has no `backend/`. It wipes and re-stages `.docker-context/` with four artifacts:

1. the backend uberjar — `clojure -T:build uber`, then the newest `underscore-*.jar` under `backend/target/`;
2. the Roslyn CLI — `dotnet publish backend/tools/roslyn-cli/RoslynCli.csproj -c Release`, asserting `RoslynCli.dll` exists afterwards;
3. `report-dist/` — `pnpm install --frozen-lockfile && pnpm build && pnpm build:singlefile` **in this repo**;
4. the singlefile template — the first of `report-dist-singlefile/index.html` or `report-dist/underscore-report.html` that exists.

Two guards: `report-dist/pr-output.json` is deleted and asserted absent (no client analysis data may ship in the distributable), and the singlefile HTML must contain `__UNDERSCORE_REPORT_DATA__`. The build is forced to `linux/amd64` (`IMAGE_PLATFORM`) so an Apple Silicon build never ships unrunnable to GitHub-hosted runners. Tag with `IMAGE_TAG=…`, default `ghcr.io/logphase/underscore-ci:dev`. The script builds; it never pushes.

## `scripts/build-singlefile.mjs` — build-time

Assembles the single-file template from the multi-file `report-dist/` build into `report-dist-singlefile/index.html`, replacing `vite-plugin-singlefile`, which under rolldown-vite emitted a corrupted document. It is deliberately dumb: every splice is `split`/`join`, never `String.replace`, so `$`-pattern expansion is structurally impossible; the only content transforms are the two mandatory HTML-safety escapes inside inlined code (`</script` → `\x3C/script`, `<!--` → `\x3C!--`); CSS `url()` assets and fonts become base64 `data:` URIs so the artifact is `file://`-safe.

Guards, each a hard throw: no raw NUL byte in inlined code (the HTML parser rewrites NUL to U+FFFD once inlined, which silently changed behavior between the two builds); exactly one module script; the `__UNDERSCORE_REPORT_DATA__` marker still present; no external asset reference surviving; exactly two `</script>` closers; no unescaped `<!--` inside the bundle.

## `scripts/inject-report-data.mjs` — CI-time (also baked into the image)

```
node inject-report-data.mjs <template.html> <pr-output.json> <out.html>
```

Requires the marker, parses the JSON before inlining (so a malformed payload fails loudly), then escapes **every** `<` as `\u003c` — valid JSON, identical after `JSON.parse`, and incapable of terminating the script element. The write uses a function replacer to avoid `$`-pattern expansion. The renderer reads the resulting `<script id="underscore-report-data">` tag first and falls back to `fetch('./pr-output.json')` when the marker is still raw.

## `scripts/publish-report.sh` — CI-time, on the runner

Publishes the staged report and maintains the reports branch. Every piece of GitHub context arrives through `env:`, never string interpolation, so a hostile PR title cannot inject shell.

**Target resolution.** With `REPORTS_REPO` + `REPORTS_DEPLOY_KEY` it writes the deploy key to a 0600 file, sets `GIT_SSH_COMMAND`, and clones (or orphan-inits) `REPORTS_BRANCH` in that dedicated repo. Otherwise it adds a worktree on the same repo's orphan `REPORTS_BRANCH`, creating it when absent.

**Layout.** `pr` mode writes `reports/pr-<N>/underscore-report.html`, replacing that directory on every push, and upserts the PR's `runs.json` entry (`map(select(.pr != $r.pr)) + [$r]`). `full` mode writes `reports/<UTC-stamp>-run-<n>/` plus a stable `latest/`, and appends to `runs.json`. The PR-mode journey count is the number of journeys the diff touches (`prStatus != null`), not the repo total.

**Root landing.** If the staged `underscore-hub.html` exists it becomes the branch's `index.html` — the SPA in hub mode. Otherwise the bundled `viewer/index.html` board is copied as a fallback, so a mixed rollout with an older image never loses its landing page. `.nojekyll` is always touched.

**`repo-manifest.json`** is rewritten on every publish: `schema: "underscore.repo-manifest/v1"`, `repo`, `repoUrl`, `generatedAt`, `architecture`, `specs`, and a `prs` index derived from `runs.json` (newest first). `architecture` and `specs` are refreshed from `pr-output.json` only by a `full` run; a PR publish preserves the previous copy verbatim, so a PR's tinted diagram never overwrites the clean global one. Large blobs cross into `jq` by file (`--slurpfile`) because the specs bundle overflows `ARG_MAX` as an `--argjson`.

Commit, then push with a single `pull --rebase` retry on the race between concurrent runs. With `VIEWER_URL` set, two links are appended to the step summary.

## `scripts/retire-report.sh` — CI-time, on the runner

Runs when the *current* revision of a PR is infrastructure-only. It resolves the same two publish targets, then removes `reports/pr-<N>/` and drops the PR's `runs.json` entry, commits and pushes (with a rebase retry). It rewrites the PR comment to an honest "this revision changes no C# files… the previous analysis was retired" note **only when a marker comment already exists**, so a never-analyzed infra PR is a completely clean no-op — no branch change, no comment noise. A missing reports branch exits 0 early.

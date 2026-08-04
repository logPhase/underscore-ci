# Reference — scripts & image

Every script and every Dockerfile layer. Distinguishes **build-time** (run once
to produce the image) from **CI-time** (run on every analysis).

## Dockerfile ([`Dockerfile`](../../Dockerfile))

| Layer | Detail |
|---|---|
| Base | `eclipse-temurin:21-jre` |
| apt | `git` (worktree diffing), `jq` (SHA resolution), `curl`, `ca-certificates`, `nodejs` (runs `inject-report-data.mjs`), `gh` (comment upsert, from cli.github.com apt repo) |
| .NET | .NET 10 SDK via `dotnet-install.sh --channel 10.0` → `/usr/share/dotnet`; `dotnet-install.sh` kept at `/usr/local/bin/` for lazy per-repo SDK pins |
| ENV (.NET) | `DOTNET_ROOT=/usr/share/dotnet`, `DOTNET_INSTALL_SCRIPT=/usr/local/bin/dotnet-install.sh`, telemetry/nologo/first-time opts; PATH prepends `DOTNET_ROOT` |
| ENV (backend) | `UNDERSCORE_MODE=container`, `UNDERSCORE_IN_CONTAINER=1`, `UNDERSCORE_ROSLYN_CLI=/opt/underscore/roslyn-cli/RoslynCli.dll` (DLL mode — no runtime build), `UNDERSCORE_RUNS_DIR=/tmp/underscore/runs` |
| COPY (from `.docker-context/`) | `underscore-cli.jar` → `/opt/underscore/`; `roslyn-cli/` → `/opt/underscore/roslyn-cli/`; `report-dist/` → `/opt/underscore/report-dist/`; `underscore-report.template.html` → `/opt/underscore/`; `scripts/inject-report-data.mjs` → `/opt/underscore/scripts/`; `entrypoint.sh` → `/entrypoint.sh` |
| Entrypoint | `ENTRYPOINT ["/entrypoint.sh"]`; trailing `LABEL org.opencontainers.image.source` as a cache-stable last layer |

## Scripts

### `scripts/build-image.sh` — **build-time**
Builds the analysis image from a **sibling `underscore-desktop` checkout**
(arg or `UNDERSCORE_DESKTOP_DIR`). It:
1. builds the backend uberjar (`clojure -T:build uber`),
2. publishes the framework-dependent Roslyn CLI DLL (`dotnet publish`),
3. builds the report (`pnpm build` + `pnpm build:singlefile`),
4. stages all four artifacts into `.docker-context/`,
5. `docker build` for `linux/amd64` (default tag `ghcr.io/logphase/underscore-ci:dev`).

Guards: deletes and asserts absence of `report-dist/pr-output.json` (no client
data baked in); asserts the singlefile HTML carries the
`__UNDERSCORE_REPORT_DATA__` marker.
Override tag with `IMAGE_TAG=…`. How-to: [build-and-push-the-image](../how-to/build-and-push-the-image.md).

### `scripts/build-singlefile.mjs` — **build-time**
Invoked by `pnpm build:singlefile`. Assembles the single-file template from the
multi-file `report-dist/` build (→ `report-dist-singlefile/index.html`),
replacing the buggy `vite-plugin-singlefile`. Inlines the one module `<script>`
and CSS `<link>`s, converts `url()` font/asset refs to base64 `data:` URIs for
`file://` safety. Uses split/join splicing (never `String.replace`, avoids
`$`-pattern corruption); escapes `</script`→`\x3C/script` and `<!--`→`\x3C!--`
inside inlined code. Guards: rejects raw NUL bytes; exactly 1 module script;
preserves the marker; no leftover external refs; exactly 2 `</script>`.

### `scripts/inject-report-data.mjs` — **CI-time** (also baked into the image)
`node inject-report-data.mjs <template.html> <pr-output.json> <out.html>`.
Requires the `__UNDERSCORE_REPORT_DATA__` marker; parses+re-serializes the JSON
escaping every `<` as `<` (payload can't terminate the script tag); writes
via a function replacer (avoids `$`-pattern expansion). The renderer reads the
resulting inline `<script id="underscore-report-data">` tag first, falling back
to `fetch()` when the marker is still raw.

### `scripts/publish-report.sh` — **CI-time** (composite step, on the runner)
Publishes the staged report to the reports branch and maintains the viewer.
Target: external `REPORTS_REPO` + `REPORTS_DEPLOY_KEY` over SSH, else same-repo
orphan `REPORTS_BRANCH`. **pr** → `reports/pr-<N>/` (refreshed per push) + upsert
the `runs.json` entry by PR. **full** → `reports/<stamp>-run-<n>/` + `latest/` +
append to `runs.json`. Always rewrites the branded `viewer/index.html` landing
page + `.nojekyll`, commits, pushes with one rebase-retry on races. All GitHub
context arrives via env (injection-safe).

### `scripts/retire-report.sh` — **CI-time** (composite step)
Runs when a PR became infrastructure-only. Removes `reports/pr-<N>/` and its
`runs.json` entry from the reports branch, commits/pushes; rewrites the PR
comment to an honest "nothing to analyze, previous analysis retired" note **only
if** a marker comment already exists. A never-analyzed infra PR is a clean no-op.

## Build-time vs CI-time at a glance

| Script | When | Where |
|---|---|---|
| `build-image.sh` | build-time | maintainer machine (needs desktop checkout, JDK/Clojure/.NET/pnpm) |
| `build-singlefile.mjs` | build-time | via `pnpm build:singlefile` |
| `inject-report-data.mjs` | CI-time | inside the container (artifact delivery) |
| `publish-report.sh` | CI-time | on the runner (has git + push creds) |
| `retire-report.sh` | CI-time | on the runner |
</content>

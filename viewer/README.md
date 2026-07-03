# Underscore hosted report viewer

A pure static web server that hosts Underscore analysis reports. **No backend,
no IP.** It serves the content of the `underscore-reports` branch — a run index
plus per-run *self-contained single-file HTML* reports (all JS/CSS inlined,
analysis **output** only). Because it is nginx serving static files, it is safe
to run in APCOA's K8s next to their other workloads.

The analysis backend (Clojure + Roslyn — the actual IP) never runs here. It
runs ephemerally in CI inside the private analysis image, emits the single-file
report, and the CI job commits that HTML to the `underscore-reports` branch.
This viewer only serves what the branch contains.

## How it works

```
  apcoa-tech/iris-vas @ underscore-reports          (orphan branch, report OUTPUT)
        │
        │  git-sync sidecar  (clones + keeps the branch in sync on a shared volume)
        ▼
  shared emptyDir volume  ──mounted──►  nginx (this image)  ──HTTP──►  users
```

- A **git-sync sidecar** clones the `underscore-reports` branch and keeps it
  up to date on a volume shared with the nginx container. New CI runs push new
  commits; git-sync pulls them; the viewer reflects them with no redeploy.
- **nginx** (this image) serves that volume as a static site on port **8080**.

### Content contract with the CI report branch

The CI publish step (see `examples/underscore-full.yml` in this repo) commits,
on the orphan `underscore-reports` branch of `apcoa-tech/iris-vas`:

| Path | Mutability | Purpose |
|---|---|---|
| `index.html` | regenerated each run | landing page / run index |
| `latest/underscore-report.html` | **overwritten each run** | stable link to the newest report |
| `reports/<UTC-stamp>-run-<n>/underscore-report.html` | **immutable** | the report for one specific run |

The viewer serves exactly these paths. It never lists directories
(`autoindex off`); reports are reached by their exact URL.

## The three gotchas (why the config looks the way it does)

1. **git-sync serves through an atomically-swapped symlink.** git-sync doesn't
   write the worktree at the docroot; it keeps `rev-<sha>/` dirs and flips a
   symlink. We let git-sync own the docroot symlink itself
   (`--root=/usr/share/nginx --link=html`, so `/usr/share/nginx/html` *is* the
   link). nginx therefore keeps `open_file_cache` **off** (otherwise it pins the
   old rev and serves stale reports after a swap) and leaves `disable_symlinks`
   at the default off (turning it on would make nginx refuse the symlink and
   404 everything).
2. **`latest/` and `index.html` are mutable; `reports/<stamp>/` is immutable.**
   Per-run reports get a 1-year `immutable` cache; `index.html` and everything
   under `latest/` get `no-cache` so a new run shows up immediately instead of
   being frozen behind a stale cached copy.
3. **nginx `add_header` doesn't merge across levels.** A child `add_header`
   silently drops all inherited ones, so the security headers + the
   path-derived `Cache-Control` are emitted from one `add_header` block at
   server level, and Cache-Control is selected via a `map`. No location adds its
   own header. (See `nginx.conf` for the annotated detail.)

## Response headers

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: no-referrer`
- `Cache-Control:` `no-cache` for `index.html` + `latest/`; `public, max-age=31536000, immutable` for `reports/<stamp>/`.

No CSP is set: the single-file reports are self-contained and legitimately rely
on inline JS/CSS, so a CSP that blocks inline would break them. `nosniff` +
`SAMEORIGIN` cover the meaningful static-hosting risks.

## Build

Fast build (this is the lightweight viewer image, **not** the heavy analysis
image):

```sh
docker build --platform linux/amd64 \
  -t ghcr.io/logphase/underscore-viewer:dev \
  -f viewer/Dockerfile viewer
```

## Run locally without the sidecar

Mount a directory shaped like the branch straight at the docroot:

```sh
mkdir -p /tmp/reports/x latest
echo '<h1>Underscore reports</h1>' > /tmp/index.html          # + reports/ + latest/
docker run --rm -p 8080:8080 -v /tmp/site:/usr/share/nginx/html \
  ghcr.io/logphase/underscore-viewer:dev
curl -i http://localhost:8080/
```

## Deploying in K8s (sketch)

Two containers, one shared `emptyDir`:

```yaml
volumes:
  - name: report-content
    emptyDir: {}
containers:
  - name: git-sync
    image: registry.k8s.io/git-sync/git-sync:v4.x.x
    args:
      - --repo=https://github.com/apcoa-tech/iris-vas
      - --ref=underscore-reports
      - --root=/usr/share/nginx     # git-sync owns this dir
      - --link=html                 # -> /usr/share/nginx/html is the live symlink
      - --period=30s
    volumeMounts:
      - { name: report-content, mountPath: /usr/share/nginx }
  - name: viewer
    image: ghcr.io/logphase/underscore-viewer:dev
    ports: [{ containerPort: 8080 }]
    volumeMounts:
      - { name: report-content, mountPath: /usr/share/nginx }
    readinessProbe:
      httpGet: { path: /, port: 8080 }
```

The viewer only becomes ready once git-sync has populated the volume — before
the first sync, `/` is an honest 404 and the readiness probe holds traffic off.
Private-repo auth for git-sync (token/SSH) is configured on the sidecar; the
viewer never needs credentials because it only reads static files.

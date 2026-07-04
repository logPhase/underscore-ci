# Underscore report viewer — Kubernetes deployment

A stateless static web server for the pre-rendered Underscore reports. It carries **no
analysis IP** — it only serves the self-contained HTML committed to the orphan
`underscore-reports` branch of `apcoa-tech/iris-vas`. Safe to run in APCOA AKS.

## How it works

Two containers share one `emptyDir` mounted at `/usr/share/nginx/html` in both:

- **`git-sync`** (`registry.k8s.io/git-sync/git-sync:v4.4.0`) clones/pulls the
  `underscore-reports` branch every 60s.
- **`nginx`** (`ghcr.io/logphase/underscore-viewer`) serves it.

### git-sync path layout (the important bit)

git-sync v4 does **not** check out into the root directly. It keeps worktrees under
`<GITSYNC_ROOT>/.worktrees/<sha>` and maintains a symlink `<GITSYNC_ROOT>/<GITSYNC_LINK>`
that atomically flips to the newest worktree after each successful pull. We set:

| Setting | Value |
|---|---|
| `GITSYNC_ROOT` | `/usr/share/nginx/html` (the shared emptyDir) |
| `GITSYNC_LINK` | `current` |
| worktree checkout | `/usr/share/nginx/html/.worktrees/<sha>` |
| **nginx document root** | **`/usr/share/nginx/html/current`** (the symlink) |

So the branch content resolves at:

```
/usr/share/nginx/html/current/index.html
/usr/share/nginx/html/current/reports/<stamp>/underscore-report.html
/usr/share/nginx/html/current/latest/...
```

nginx serves the **link**, never a fixed worktree, so updates are atomic and it always
serves the newest commit. The docroot is pinned by the `underscore-viewer-nginx`
ConfigMap (mounted at `/etc/nginx/conf.d/default.conf`), so it does not depend on the
image's baked default. The config also follows the git-sync symlink
(`disable_symlinks off`).

### Probes

- **Liveness** → `/healthz` (a ConfigMap `return 200`), always up even before the first
  sync, so a slow/failed initial clone never crash-loops nginx.
- **Readiness** → `/`, which 404s until the first sync lands `index.html`. This keeps the
  Pod out of the Service until reports actually exist.

## Apply order

1. **Create the Secret** (once, out-of-band — do not commit real values):

   ```sh
   kubectl create secret generic underscore-reports-git \
     --namespace <ns> \
     --from-literal=GITSYNC_USERNAME='<github-username>' \
     --from-literal=GITSYNC_PASSWORD='<read-only-PAT>'
   ```

   The PAT needs **only `Contents: Read-only` on `apcoa-tech/iris-vas`** (a fine-grained
   PAT). No write, no other repos. `secret.example.yaml` is a shape reference only.

2. **Apply the workload:**

   ```sh
   kubectl apply -f deployment.yaml   # ConfigMap + Deployment
   kubectl apply -f service.yaml
   kubectl apply -f ingress.yaml
   ```

## Set the ingress host

Edit `ingress.yaml` and replace every `underscore.INTERNAL.apcoa` placeholder with the
real internal host, then set:

- `spec.ingressClassName` to your controller's class (`nginx`, or
  `azure-application-gateway` for AGIC — also change the class annotation accordingly).
- `spec.tls[].secretName` to the real cluster cert secret, or keep the
  `cert-manager.io/cluster-issuer` annotation and point it at your real ClusterIssuer so
  cert-manager provisions `underscore-viewer-tls` automatically.

## Notes

- git-sync runs as uid/gid `65533`; the Pod `fsGroup: 65533` makes the shared volume
  writable for it. nginx mounts the same volume read-only.
- No persistence: the volume is an `emptyDir`; on restart git-sync re-clones (depth 1).

## Basic auth (access gate)

The viewer is gated by nginx **basic auth** (parking-sim style) — an htpasswd from a
K8s secret the ConfigMap references at `/etc/nginx/.htpasswd`. The `/healthz` and
`/readyz` probe endpoints opt out (`auth_basic off`) so kube-probes and the App
Gateway health probe never need credentials; `/readyz` returns 200 only once
git-sync has landed `index.html`.

Create (or rotate) the credential:

```bash
htpasswd -nb -m <user> '<password>' \
  | kubectl create secret generic underscore-viewer-htpasswd -n iris \
      --from-literal=.htpasswd=/dev/stdin --dry-run=client -o yaml \
  | kubectl apply -f -
kubectl rollout restart deployment/underscore-viewer -n iris   # pick up a new secret
```

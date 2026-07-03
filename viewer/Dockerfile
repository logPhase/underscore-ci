# Underscore hosted report VIEWER — a pure static web server.
#
# It serves the `underscore-reports` branch content (a run index + per-run
# self-contained single-file HTML reports) over HTTP. There is NO backend and
# NO IP in this image: the reports are analysis OUTPUT only, and they are NOT
# baked in here. A git-sync sidecar pulls the branch into a shared volume at
# runtime and this nginx serves it. Safe to run in APCOA's K8s.
#
# Build (fast — this is the viewer image, not the heavy analysis image):
#   docker build --platform linux/amd64 \
#     -t ghcr.io/logphase/underscore-viewer:dev \
#     -f viewer/Dockerfile viewer
FROM nginx:1.27-alpine

# Our server block. It fully replaces the stock default site.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# GOTCHA 1: the docroot /usr/share/nginx/html is owned by the git-sync sidecar
# at runtime — it maintains rev-<sha> dirs on the shared volume and flips the
# `html` symlink to the live one (sidecar: --root=/usr/share/nginx --link=html).
# Remove the stock demo index so, before the first sync completes, "/" is an
# honest 404 (not-ready) rather than nginx's welcome page. When a real report
# volume is mounted it shadows this path entirely.
RUN rm -rf /usr/share/nginx/html/* \
 && mkdir -p /usr/share/nginx/html

# Unprivileged port (see nginx.conf `listen 8080`) so the container can run as
# a non-root user under a restricted K8s SecurityContext.
EXPOSE 8080

# Healthcheck on / (200). busybox wget ships in the base image, so no extra
# packages. --spider makes a HEAD-like probe and exits non-zero on any non-2xx,
# so the container is only "healthy" once git-sync has populated the docroot.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

# Base image's entrypoint/CMD already launch nginx in the foreground.

#!/usr/bin/env bash
# Build the underscore-ci action image from a sibling underscore-desktop checkout.
#
# Stages into .docker-context/:
#   underscore-cli.jar                backend uberjar
#   roslyn-cli/                       dotnet publish of backend/tools/roslyn-cli
#   report-dist/                      static report build (pnpm build)
#   underscore-report.template.html   singlefile report build (pnpm build:singlefile)
#
# usage: scripts/build-image.sh [desktop-dir]
#   desktop-dir defaults to $UNDERSCORE_DESKTOP_DIR, then the sibling checkout.
set -euo pipefail

CI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="${1:-${UNDERSCORE_DESKTOP_DIR:-$(cd "$CI_DIR/.." && pwd)/underscore-desktop}}"
IMAGE_TAG="${IMAGE_TAG:-ghcr.io/logphase/underscore-ci:dev}"
# GitHub-hosted runners are linux/amd64 — force the platform so images built
# on Apple Silicon don't ship as unrunnable arm64.
IMAGE_PLATFORM="${IMAGE_PLATFORM:-linux/amd64}"
CTX="$CI_DIR/.docker-context"

[[ -d "$DESKTOP_DIR/backend" ]] || {
  echo "usage: $0 [desktop-dir]  (no underscore-desktop backend at: $DESKTOP_DIR)" >&2
  exit 1
}

rm -rf "$CTX"
mkdir -p "$CTX"

echo "==> Backend uberjar (clojure -T:build uber)"
(cd "$DESKTOP_DIR/backend" && clojure -T:build uber)
JAR="$(find "$DESKTOP_DIR/backend/target" -maxdepth 1 -name 'underscore-*.jar' | sort | tail -n1)"
[[ -n "$JAR" ]] || { echo "uberjar not found under $DESKTOP_DIR/backend/target" >&2; exit 1; }
cp "$JAR" "$CTX/underscore-cli.jar"

echo "==> Roslyn CLI publish (framework-dependent DLL)"
dotnet publish "$DESKTOP_DIR/backend/tools/roslyn-cli/RoslynCli.csproj" \
  -c Release -o "$CTX/roslyn-cli"
[[ -f "$CTX/roslyn-cli/RoslynCli.dll" ]] || { echo "RoslynCli.dll missing after publish" >&2; exit 1; }

echo "==> Kotlin parser JAR (mvnw package)"
(cd "$DESKTOP_DIR/backend/tools/kotlin-parser" && ./mvnw -q -DskipTests package)
KJAR="$DESKTOP_DIR/backend/tools/kotlin-parser/target/kotlin-parser-1.0-SNAPSHOT.jar"
[[ -f "$KJAR" ]] || { echo "kotlin-parser jar not found after build" >&2; exit 1; }
mkdir -p "$CTX/kotlin-parser"
cp "$KJAR" "$CTX/kotlin-parser/kotlin-parser.jar"

echo "==> Report build (pnpm build + build:singlefile)"
(cd "$CI_DIR" && pnpm install --frozen-lockfile && pnpm build && pnpm build:singlefile)
[[ -d "$CI_DIR/report-dist" ]] || { echo "report-dist/ missing — did 'pnpm build' run?" >&2; exit 1; }
cp -R "$CI_DIR/report-dist" "$CTX/report-dist"
# The report ships with an EMPTY pr-output.json slot — the action fills it per
# PR. Never bake an analysis export (client data) into the distributable image.
rm -f "$CTX/report-dist/pr-output.json"
[[ ! -e "$CTX/report-dist/pr-output.json" ]] || {
  echo "report-dist/pr-output.json must not ship in the image" >&2
  exit 1
}

SINGLEFILE=""
for candidate in \
  "$CI_DIR/report-dist-singlefile/index.html" \
  "$CI_DIR/report-dist/underscore-report.html"; do
  [[ -f "$candidate" ]] && { SINGLEFILE="$candidate"; break; }
done
[[ -n "$SINGLEFILE" ]] || { echo "singlefile HTML not found — did 'pnpm build:singlefile' run?" >&2; exit 1; }
grep -q '__UNDERSCORE_REPORT_DATA__' "$SINGLEFILE" || {
  echo "singlefile HTML lacks the __UNDERSCORE_REPORT_DATA__ marker (see scripts/inject-report-data.mjs)" >&2
  exit 1
}
cp "$SINGLEFILE" "$CTX/underscore-report.template.html"

echo "==> docker build $IMAGE_TAG ($IMAGE_PLATFORM)"
docker build --platform "$IMAGE_PLATFORM" -t "$IMAGE_TAG" -f "$CI_DIR/Dockerfile" "$CI_DIR"

echo "Built $IMAGE_TAG"
echo "Push with: docker push $IMAGE_TAG"

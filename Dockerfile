# Underscore PR Analysis — GitHub Action container image.
#
# Build context is staged by scripts/build-image.sh into .docker-context/:
#   underscore-cli.jar                backend uberjar (clojure -T:build uber)
#   roslyn-cli/                       dotnet publish of backend/tools/roslyn-cli
#   report-dist/                      static Vite build of the report renderer
#   underscore-report.template.html   vite-plugin-singlefile build (JSON marker inside)
FROM eclipse-temurin:21-jre

# git      — the pr pipeline diffs base/head via git worktrees
# jq       — resolve base/head SHAs from GITHUB_EVENT_PATH
# gh       — PR comment upsert via the GitHub CLI
# nodejs   — scripts/inject-report-data.mjs (inline JSON into the singlefile report)
RUN apt-get update \
 && apt-get install -y --no-install-recommends git jq curl ca-certificates nodejs \
 && mkdir -p /etc/apt/keyrings \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

# .NET: the Roslyn CLI ships as a framework-dependent DLL (`dotnet RoslynCli.dll`)
# and MSBuildWorkspace needs a real SDK. Pre-install the .NET 10 SDK; keep
# dotnet-install.sh available so dotnet_sdk.clj can lazily install additional
# SDK versions pinned by a client repo's global.json/TFMs (container mode
# expects DOTNET_ROOT + DOTNET_INSTALL_SCRIPT — see backend dotnet_sdk.clj).
ENV DOTNET_ROOT=/usr/share/dotnet \
    DOTNET_INSTALL_SCRIPT=/usr/local/bin/dotnet-install.sh \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1 \
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1
RUN curl -fsSL https://dot.net/v1/dotnet-install.sh -o "$DOTNET_INSTALL_SCRIPT" \
 && chmod +x "$DOTNET_INSTALL_SCRIPT" \
 && "$DOTNET_INSTALL_SCRIPT" --channel 10.0 --install-dir "$DOTNET_ROOT"
ENV PATH="${DOTNET_ROOT}:${PATH}"

# Backend runtime knobs (see backend main.clj / roslyn.clj / runs.clj):
#   UNDERSCORE_MODE=container      — container output posture
#   UNDERSCORE_ROSLYN_CLI=<.dll>   — DLL mode: `dotnet RoslynCli.dll <sln>`, no build step
#   UNDERSCORE_RUNS_DIR            — keep run artifacts off $HOME, inside the container
ENV UNDERSCORE_MODE=container \
    UNDERSCORE_IN_CONTAINER=1 \
    UNDERSCORE_ROSLYN_CLI=/opt/underscore/roslyn-cli/RoslynCli.dll \
    UNDERSCORE_RUNS_DIR=/tmp/underscore/runs

COPY .docker-context/underscore-cli.jar /opt/underscore/underscore-cli.jar
COPY .docker-context/roslyn-cli/ /opt/underscore/roslyn-cli/
COPY .docker-context/report-dist/ /opt/underscore/report-dist/
COPY .docker-context/underscore-report.template.html /opt/underscore/underscore-report.template.html
COPY scripts/inject-report-data.mjs /opt/underscore/scripts/inject-report-data.mjs
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

# Underscore PR Analysis — GitHub Action container image.
#
# Build context is staged by scripts/build-image.sh into .docker-context/:
#   underscore-cli.jar                backend uberjar (clojure -T:build uber)
#   roslyn-cli/                       dotnet publish of backend/tools/roslyn-cli
#   python-analyzer/                  backend/tools/python-analyzer-pyright (sources)
#   report-dist/                      static Vite build of the report renderer
#   underscore-report.template.html   vite-plugin-singlefile build (JSON marker inside)
FROM eclipse-temurin:21-jre

# git      — the pr pipeline diffs base/head via git worktrees
# jq       — resolve base/head SHAs from GITHUB_EVENT_PATH
# gh       — PR comment upsert via the GitHub CLI
# nodejs   — scripts/inject-report-data.mjs (inline JSON into the singlefile report)
RUN apt-get update \
 && apt-get install -y --no-install-recommends git jq curl ca-certificates nodejs \
      python3 python3-venv python3-pip \
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
    UNDERSCORE_PYTHON_ANALYZER=/opt/underscore/python-analyzer \
    UNDERSCORE_PYTHON_BIN=/opt/underscore/python-analyzer/.venv/bin/python \
    UNDERSCORE_RUNS_DIR=/tmp/underscore/runs

COPY .docker-context/underscore-cli.jar /opt/underscore/underscore-cli.jar
COPY .docker-context/roslyn-cli/ /opt/underscore/roslyn-cli/

# Python analysis (Pyright LSP). `lang: python` has been an advertised action
# input since the beginning, but nothing shipped behind it — the image had no
# python3 at all, so every Python run died on "pyright analyzer package not
# found". Package it properly: the analyzer sources, a venv holding pyright,
# and a pre-warmed bundled Node.
#
# UNDERSCORE_PYTHON_BIN is the important half. Without it the backend
# bootstraps a venv at RUN TIME (python3 -m venv + pip install), which needs
# network from inside a client's CI runner and would fail closed on any
# restricted network. Pointing it at a venv baked in here makes the analysis
# hermetic.
COPY .docker-context/python-analyzer/ /opt/underscore/python-analyzer/
RUN python3 -m venv /opt/underscore/python-analyzer/.venv \
 && /opt/underscore/python-analyzer/.venv/bin/pip install -q --no-cache-dir \
      -r /opt/underscore/python-analyzer/requirements.txt \
 && /opt/underscore/python-analyzer/.venv/bin/python -m pyright --version
COPY .docker-context/report-dist/ /opt/underscore/report-dist/
COPY .docker-context/underscore-report.template.html /opt/underscore/underscore-report.template.html
COPY scripts/inject-report-data.mjs /opt/underscore/scripts/inject-report-data.mjs
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

# Last on purpose: metadata-only layer, keeps everything above cache-stable.
LABEL org.opencontainers.image.source="https://github.com/logPhase/underscore-ci"

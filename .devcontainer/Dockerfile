# Each tool is fetched in its own stage (built in parallel), and the final image copies them in last. Bumping one
# tool's version rebuilds its stage and the cheap copies after it, not the slow system installs before them.
#
# Declare each ARG in the stage that uses it, right before its first use: a changed ARG reruns every RUN after its
# declaration in that stage. ARGs before the first FROM are only for FROM lines.

# https://github.com/devcontainers/images/blob/main/src/base-debian/history
ARG BASE_IMAGE=mcr.microsoft.com/devcontainers/base:2.2.1-debian13
ARG NODE_VERSION=24.22.1
ARG GO_VERSION=1.26.10
# OpenTofu, for `infra/` (see `tofuImage` in `dagger/main.go`). Under 7 days old: an emergency security bump (1.13.2
# stops trusting compromised intermediate certificates when `tofu init` downloads providers). Drop this note after
# 2026-10-28
ARG TOFU_IMAGE=ghcr.io/opentofu/opentofu:1.13.2-minimal@sha256:622dc6bb98b105c18f53cf419ab64a4f3b88bd9f8c16cc978cf89e4202f4613f

FROM node:${NODE_VERSION}-trixie-slim AS node

FROM ${TOFU_IMAGE} AS tofu

FROM golang:${GO_VERSION}-trixie AS go
# The latest gopls may need a newer Go than the pinned one: let Go fetch it for this build only
RUN GOTOOLCHAIN=auto go install golang.org/x/tools/gopls@latest

FROM ${BASE_IMAGE} AS base
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install vim -y
ARG USER=leyman
RUN adduser $USER && \
    echo $USER:$USER | chpasswd && \
    adduser $USER sudo
ENV HOME="/home/$USER"

FROM base AS pnpm
# Only bump to a release at least 7 days old, see `pnpmVersion` in `dagger/main.go`
ARG PNPM_VERSION=12.9.1
ENV PNPM_HOME="$HOME/.local/share/pnpm"
RUN curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=$PNPM_VERSION SHELL=bash sh -

# Lists the system packages Playwright's browsers need, one per line (on `base`, so none are installed yet). The final
# image installs from the list, so that step reruns only when the list changes, not when Node or pnpm do.
FROM base AS playwright-deps
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=pnpm $HOME/.local/share/pnpm $HOME/.local/share/pnpm
# Only for the browsers' system libraries; browsers themselves are installed by the `playwright-install` target
ARG PLAYWRIGHT_VERSION=1.64.1
RUN cd /tmp \
    && $HOME/.local/share/pnpm/bin/pnpm dlx playwright@${PLAYWRIGHT_VERSION} install-deps --dry-run chromium firefox webkit \
        | sed -n 's/^  \([a-z0-9][a-z0-9.+-]*\)$/\1/p' > /playwright-deps.txt \
    && test -s /playwright-deps.txt

# For ad-hoc scripts only, so not mirrored in Dagger. Prebuilt CPython from
# https://github.com/astral-sh/python-build-standalone.
# pip is upgraded under 7 days old: an emergency security bump. Drop this note and the upgrade after 2026-10-27,
# once a python-build-standalone release ships pip >=26.2.2
FROM base AS python
# PYTHON_BUILD is the python-build-standalone release tag; only bump to a release at least 7 days old
ARG PYTHON_VERSION=3.14.8
ARG PYTHON_BUILD=20261009
RUN wget "https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_BUILD}/cpython-${PYTHON_VERSION}+${PYTHON_BUILD}-$(uname -m)-unknown-linux-gnu-install_only.tar.gz" -O /tmp/python.tar.gz && \
    tar -C $HOME -xzf /tmp/python.tar.gz && \
    mv $HOME/python $HOME/.python && \
    rm /tmp/python.tar.gz && \
    $HOME/.python/bin/python3 -m pip install --no-cache-dir --upgrade "pip>=26.2.2"

# GitHub CLI, for local use only (not mirrored in Dagger). Only bump to a release at least 7 days old
FROM base AS gh
ARG GH_VERSION=2.102.0
RUN wget "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_$(dpkg --print-architecture).tar.gz" -O /tmp/gh.tar.gz \
    && mkdir /opt/gh \
    && tar -C /opt/gh --strip-components=1 -xzf /tmp/gh.tar.gz \
    && rm /tmp/gh.tar.gz

FROM base AS dagger
ARG DAGGER_VERSION=0.21.11
RUN curl -fsSL https://dl.dagger.io/dagger/install.sh | DAGGER_VERSION=${DAGGER_VERSION} BIN_DIR=/opt/dagger sh

FROM base

# Client tools (`psql`, `pg_dump`) from the PostgreSQL apt repository, matching the `postgres` sidecar's major version:
# `pg_dump` must be at least the server's. See `postgresMajor` in `dagger/main.go`
ARG POSTGRES_MAJOR=18
RUN apt-get install --yes --no-install-recommends postgresql-common \
    && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y \
    && apt-get install --yes --no-install-recommends postgresql-client-${POSTGRES_MAJOR}

# System libraries for Playwright's browsers (needs root, so it can't happen at test time), as `install-deps` would
RUN --mount=type=bind,from=playwright-deps,source=/playwright-deps.txt,target=/tmp/playwright-deps.txt \
    xargs --arg-file=/tmp/playwright-deps.txt apt-get install --yes --no-install-recommends

# Install brew https://brew.sh/
RUN NONINTERACTIVE=1 export LEYMAN_HOMEBREW_CACHE="${HOME}/.cache/Homebrew" LEYMAN_HOMEBREW_PREFIX=/home/linuxbrew/.linuxbrew LEYMAN_BASHRC="${HOME}/.bashrc" \
    && mkdir -p $LEYMAN_HOMEBREW_PREFIX \
    && mkdir -p $LEYMAN_HOMEBREW_CACHE \
    && chown -R $USER:$USER $LEYMAN_HOMEBREW_PREFIX \
    && chown -R $USER:$USER $LEYMAN_HOMEBREW_CACHE \
    && sudo -u $USER /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
    && echo >> $LEYMAN_BASHRC \
    && echo "eval \"$($LEYMAN_HOMEBREW_PREFIX/bin/brew shellenv bash)\"" >> $LEYMAN_BASHRC

# Install oh-my-zsh https://ohmyz.sh/
RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# Install Claude
# CLAUDE_CONFIG_DIR is set in docker-compose.yml so config is shared across worktrees
RUN curl -fsSL https://claude.ai/install.sh | bash

# Ensure NX runs at max capacity
# Although too many and we risk file overload
# (and frankly don't usually have infinite tasks that can be parallelized)
RUN NX_PARALLEL="$(nproc --all)" MAX_PARALLEL=5 \
    && echo >> $HOME/.bashrc \
    && echo "export NX_PARALLEL=$((NX_PARALLEL>MAX_PARALLEL ? MAX_PARALLEL : NX_PARALLEL))" >> $HOME/.bashrc

# Grant permissions to non-root (before the tools are copied in, already owned by them)
RUN mkdir -p $HOME/.config/vscode-dev-containers && \
    chown -R $USER:$USER $HOME

# The tools, last. No npm: pnpm only
COPY --from=gh /opt/gh/bin/gh /usr/local/bin/gh
COPY --from=tofu /usr/local/bin/tofu /usr/local/bin/tofu
COPY --from=dagger --chown=$USER:$USER /opt/dagger/dagger $HOME/.local/bin/dagger
COPY --from=python --chown=$USER:$USER $HOME/.python $HOME/.python
ENV PATH=$PATH:$HOME/.python/bin
COPY --from=go --chown=$USER:$USER /usr/local/go $HOME/.go
COPY --from=go --chown=$USER:$USER /go/bin/gopls $HOME/go/bin/gopls
ENV PATH=$PATH:$HOME/.go/bin
ENV PNPM_HOME="$HOME/.local/share/pnpm"
COPY --from=pnpm --chown=$USER:$USER $PNPM_HOME $PNPM_HOME
# pnpm 11+ installs global binaries (including itself) under `bin`
ENV PATH="$PNPM_HOME/bin:$PATH"
COPY --from=node /usr/local/bin/node /usr/local/bin/node

# Worktree-specific PATH entries (nx, biome, scripts/commands) are set via `remoteEnv`
# in devcontainer.json, since the workspace path differs per worktree.

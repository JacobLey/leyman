# https://github.com/devcontainers/images/blob/main/src/base-debian/history
FROM mcr.microsoft.com/devcontainers/base:2.2.1-debian13

ARG NODE_VERSION=24.21.0
# Only bump to a release at least 7 days old, see `pnpmVersion` in `dagger/main.go`
ARG PNPM_VERSION=12.9.1
ARG DAGGER_VERSION=0.21.10
ARG GO_VERSION=1.26.8
# For ad-hoc scripts only, so not mirrored in Dagger.
# PYTHON_BUILD is the python-build-standalone release tag; only bump to a release at least 7 days old
ARG PYTHON_VERSION=3.14.8
ARG PYTHON_BUILD=20261009
# Only for the browsers' system libraries; browsers themselves are installed by the `playwright-install` target
ARG PLAYWRIGHT_VERSION=1.62.1
# Client tools (`psql`, `pg_dump`) from the PostgreSQL apt repository, matching the `postgres` sidecar's major version:
# `pg_dump` must be at least the server's. See `postgresMajor` in `dagger/main.go`
ARG POSTGRES_MAJOR=18
# GitHub CLI, for local use only (not mirrored in Dagger). Only bump to a release at least 7 days old
ARG GH_VERSION=2.102.0

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install vim -y

RUN apt-get install --yes --no-install-recommends postgresql-common \
    && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y \
    && apt-get install --yes --no-install-recommends postgresql-client-${POSTGRES_MAJOR}

# Install the GitHub CLI. GH_CONFIG_DIR is set in docker-compose.yml so its login is shared across worktrees
RUN wget "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_$(dpkg --print-architecture).deb" -O /tmp/gh.deb \
    && apt-get install --yes /tmp/gh.deb \
    && rm /tmp/gh.deb

ARG USER=leyman
RUN adduser $USER && \
    echo $USER:$USER | chpasswd && \
    adduser $USER sudo
ENV HOME="/home/$USER"

# Install node
ENV NVM_DIR="$HOME/.nvm"
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash && \
    # Setup nvm
    \. "$NVM_DIR/nvm.sh" && \
    # Install node
    nvm install $NODE_VERSION && \
    nvm use $NODE_VERSION && \
    # Remove default npm
    npm uninstall -g npm
ENV PATH="$HOME/.nvm/versions/node/v$NODE_VERSION/bin:$PATH"

# Install pnpm
ENV PNPM_HOME="$HOME/.local/share/pnpm"
# pnpm 11+ installs global binaries (including itself) under `bin`
ENV PATH="$PNPM_HOME/bin:$PATH"
RUN curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=$PNPM_VERSION SHELL=bash sh -

# Install Go
ENV PATH=$PATH:$HOME/.go/bin
RUN ARCH="$(dpkg --print-architecture)" && \
    wget https://dl.google.com/go/go${GO_VERSION}.linux-${ARCH}.tar.gz -O /tmp/go.tar.gz && \
    tar -C $HOME -xzf /tmp/go.tar.gz && \
    mv $HOME/go $HOME/.go && \
    rm /tmp/go.tar.gz && \
    go install golang.org/x/tools/gopls@latest

# Install Python (prebuilt CPython from https://github.com/astral-sh/python-build-standalone)
ENV PATH=$PATH:$HOME/.python/bin
RUN wget "https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_BUILD}/cpython-${PYTHON_VERSION}+${PYTHON_BUILD}-$(uname -m)-unknown-linux-gnu-install_only.tar.gz" -O /tmp/python.tar.gz && \
    tar -C $HOME -xzf /tmp/python.tar.gz && \
    mv $HOME/python $HOME/.python && \
    rm /tmp/python.tar.gz

# Install dagger
RUN curl -fsSL https://dl.dagger.io/dagger/install.sh | \
    DAGGER_VERSION=${DAGGER_VERSION} BIN_DIR=$HOME/.local/bin sh

# Install system libraries for Playwright's browsers (needs root, so it can't happen at test time)
RUN pnpm dlx playwright@${PLAYWRIGHT_VERSION} install-deps chromium firefox webkit

# Install brew https://brew.sh/
#ENV PATH=/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:$PATH
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

# Grant permissions to non-root
RUN mkdir -p $HOME/.config/vscode-dev-containers && \
    chown -R $USER:$USER $HOME

# Ensure NX runs at max capacity
# Although too many and we risk file overload 
# (and frankly don't usually have infinite tasks that can be parallelized)
RUN NX_PARALLEL="$(nproc --all)" MAX_PARALLEL=5 \
    && echo >> $HOME/.bashrc \
    && echo "export NX_PARALLEL=$((NX_PARALLEL>MAX_PARALLEL ? MAX_PARALLEL : NX_PARALLEL))" >> $HOME/.bashrc

# Worktree-specific PATH entries (nx, biome, scripts/commands) are set via `remoteEnv`
# in devcontainer.json, since the workspace path differs per worktree.
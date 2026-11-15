# Each tool is fetched in its own stage (built in parallel), and the final image copies them in last. Bumping one
# tool's version rebuilds its stage and the cheap copies after it, not the slow system installs before them.
#
# Declare each ARG in the stage that uses it, right before its first use: a changed ARG reruns every RUN after its
# declaration in that stage. ARGs before the first FROM are only for FROM lines.
# fork-manifest:repo-only
#
# A `fork-manifest:when <condition>` region is only for a fork with that condition (`leyman/main/fork-manifest.json`).
# fork-manifest:end

# https://github.com/devcontainers/images/blob/main/src/base-debian/history
ARG BASE_IMAGE=mcr.microsoft.com/devcontainers/base:2.2.1-debian13@sha256:1f851004adcd3dff3776b4a1da86727cf52280b0fdc9d5b0568c9c7d74274286
# fork-manifest:when dagger
# The same image as `nodeImage` in `dagger/main.go`
# fork-manifest:end
ARG NODE_IMAGE=node:26.13.0-trixie-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39
# fork-manifest:when go
# fork-manifest:when dagger
# The same Go minor as the Dagger engine, see `goImage` in `dagger/main.go`
# fork-manifest:end
ARG GO_IMAGE=golang:1.27.3-trixie@sha256:fbb7ae40b62ff8afe31662df570d39b4f5052ac32b90dae8e60d7657a20a74f4
# fork-manifest:end
# fork-manifest:when rust
ARG RUST_IMAGE=rust:1.99.1-trixie@sha256:09027f873d45b8ecd1dc86f1fa13b7a62b875c961f017a0e331267b350430137
# fork-manifest:end
# fork-manifest:when tofu
# fork-manifest:when dagger
# The same image as `tofuImage` in `dagger/main.go`
# fork-manifest:end
ARG TOFU_IMAGE=ghcr.io/opentofu/opentofu:1.13.2-minimal@sha256:622dc6bb98b105c18f53cf419ab64a4f3b88bd9f8c16cc978cf89e4202f4613f
# fork-manifest:end

FROM ${NODE_IMAGE} AS node

# fork-manifest:when tofu
FROM ${TOFU_IMAGE} AS tofu
# fork-manifest:end

# fork-manifest:when go
FROM ${GO_IMAGE} AS go
# The latest gopls may need a newer Go than the pinned one: let Go fetch it for this build only
RUN GOTOOLCHAIN=auto go install golang.org/x/tools/gopls@latest
# fork-manifest:end

# fork-manifest:when rust
# wasm-bindgen-cli must match the `wasm-bindgen` crate in `Cargo.lock`
# fork-manifest:when dagger
# See `rustImage` in `dagger/main.go`
# fork-manifest:end
FROM ${RUST_IMAGE} AS rust
ARG CARGO_LLVM_COV_VERSION=0.9.1
ARG WASM_BINDGEN_VERSION=0.2.129
RUN rustup component add rustfmt clippy llvm-tools-preview rust-analyzer rust-src \
    && rustup target add wasm32-unknown-unknown \
    && cargo install --locked --version ${CARGO_LLVM_COV_VERSION} cargo-llvm-cov \
    && cargo install --locked --version ${WASM_BINDGEN_VERSION} wasm-bindgen-cli \
    && rm -rf /usr/local/cargo/registry /usr/local/cargo/git
# fork-manifest:end

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
# Only bump to a release at least 7 days old
# fork-manifest:when dagger
# The same version as `pnpmVersion` in `dagger/main.go`
# fork-manifest:end
ARG PNPM_VERSION=12.15.0
ENV PNPM_HOME="$HOME/.local/share/pnpm"
RUN curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=$PNPM_VERSION SHELL=bash sh -

# fork-manifest:when playwright
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
# fork-manifest:end

# For ad-hoc scripts only, so not mirrored in Dagger. Prebuilt CPython from
# https://github.com/astral-sh/python-build-standalone.
FROM base AS python
# PYTHON_BUILD is the python-build-standalone release tag; only bump to a release at least 7 days old
ARG PYTHON_VERSION=3.14.9
ARG PYTHON_BUILD=20261021
RUN wget "https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_BUILD}/cpython-${PYTHON_VERSION}+${PYTHON_BUILD}-$(uname -m)-unknown-linux-gnu-install_only.tar.gz" -O /tmp/python.tar.gz && \
    tar -C $HOME -xzf /tmp/python.tar.gz && \
    mv $HOME/python $HOME/.python && \
    rm /tmp/python.tar.gz

# GitHub CLI, for local use only (not mirrored in Dagger). Only bump to a release at least 7 days old
FROM base AS gh
ARG GH_VERSION=2.102.0
RUN wget "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_$(dpkg --print-architecture).tar.gz" -O /tmp/gh.tar.gz \
    && mkdir /opt/gh \
    && tar -C /opt/gh --strip-components=1 -xzf /tmp/gh.tar.gz \
    && rm /tmp/gh.tar.gz

# fork-manifest:when go
# Only bump to a release at least 7 days old
# fork-manifest:when dagger
# The same release as `golangciLintVersion` in `dagger/main.go`
# fork-manifest:end
FROM base AS golangci-lint
ARG GOLANGCI_LINT_VERSION=2.15.0
RUN cd /tmp \
    && release="golangci-lint-${GOLANGCI_LINT_VERSION}-linux-$(dpkg --print-architecture)" \
    && base_url="https://github.com/golangci/golangci-lint/releases/download/v${GOLANGCI_LINT_VERSION}" \
    && wget "$base_url/$release.tar.gz" "$base_url/golangci-lint-${GOLANGCI_LINT_VERSION}-checksums.txt" \
    && grep " $release.tar.gz\$" "golangci-lint-${GOLANGCI_LINT_VERSION}-checksums.txt" | sha256sum --check \
    && mkdir /opt/golangci-lint \
    && tar -C /opt/golangci-lint --strip-components=1 -xzf "$release.tar.gz" \
    && rm "$release.tar.gz" "golangci-lint-${GOLANGCI_LINT_VERSION}-checksums.txt"
# fork-manifest:end

# fork-manifest:when aws-emulator
# AWS Emulator, a local server for AWS APIs (DynamoDB...), for tests to spawn. Only its binary and license are kept: the
# package's only dependency is libc. Only bump to a release at least 7 days old, from
# https://downloads.aws.com/aws-emulator/packages/aws-emulator/LTS/versions.json (`1.0.269.1` there is `1.0.269` here).
# The signature is checked against the fingerprint of AWS's publishing key, from
# https://docs.aws.amazon.com/emulator/latest/userguide/getting-started-linux.html
# fork-manifest:when dagger
# The same version and key as `awsEmulatorVersion` and `awsEmulatorKeyFingerprint` in `dagger/main.go`
# fork-manifest:end
FROM base AS aws-emulator
ARG AWS_EMULATOR_VERSION=1.0.269
RUN cd /tmp \
    && package="aws-emulator_${AWS_EMULATOR_VERSION}-1_$(dpkg --print-architecture).deb" \
    && base_url="https://downloads.aws.com/aws-emulator/packages/aws-emulator/LTS" \
    && curl --fail --silent --show-error --location --remote-name "$base_url/$package" --remote-name "$base_url/$package.sig" \
    && export GNUPGHOME="$(mktemp -d)" \
    && curl --fail --silent --show-error --location https://downloads.aws.com/keys/gpg/current.asc | gpg --batch --quiet --import \
    && gpg --batch --status-fd 1 --verify "$package.sig" "$package" 2>/dev/null \
        | grep --quiet '^\[GNUPG:\] VALIDSIG .* 98BCF336A3BE53B734E967C52E5BF49BD940F624$' \
    && dpkg-deb --extract "$package" /tmp/aws-emulator \
    && mv /tmp/aws-emulator/opt/aws-emulator /opt/aws-emulator \
    && rm -rf "$package" "$package.sig" /tmp/aws-emulator "$GNUPGHOME"
# fork-manifest:end

# fork-manifest:when dagger
FROM base AS dagger
ARG DAGGER_VERSION=0.21.11
RUN curl -fsSL https://dl.dagger.io/dagger/install.sh | DAGGER_VERSION=${DAGGER_VERSION} BIN_DIR=/opt/dagger sh
# fork-manifest:end

FROM base

# fork-manifest:when postgres
# Client tools (`psql`, `pg_dump`) from the PostgreSQL apt repository, matching the `postgres` sidecar's major version:
# `pg_dump` must be at least the server's
# fork-manifest:when dagger
# See `postgresMajor` in `dagger/main.go`
# fork-manifest:end
ARG POSTGRES_MAJOR=18
RUN apt-get install --yes --no-install-recommends postgresql-common \
    && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y \
    && apt-get install --yes --no-install-recommends postgresql-client-${POSTGRES_MAJOR}
# fork-manifest:end

# fork-manifest:when playwright
# System libraries for Playwright's browsers (needs root, so it can't happen at test time), as `install-deps` would
RUN --mount=type=bind,from=playwright-deps,source=/playwright-deps.txt,target=/tmp/playwright-deps.txt \
    xargs --arg-file=/tmp/playwright-deps.txt apt-get install --yes --no-install-recommends
# fork-manifest:end

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

# Grant permissions to non-root (before the tools are copied in, already owned by them)
RUN mkdir -p $HOME/.config/vscode-dev-containers && \
    chown -R $USER:$USER $HOME

# The tools, last. No npm: pnpm only
COPY --from=gh /opt/gh/bin/gh /usr/local/bin/gh
# fork-manifest:when go
COPY --from=golangci-lint /opt/golangci-lint/golangci-lint /usr/local/bin/golangci-lint
# fork-manifest:end
# fork-manifest:when tofu
COPY --from=tofu /usr/local/bin/tofu /usr/local/bin/tofu
# fork-manifest:end
# fork-manifest:when dagger
COPY --from=dagger --chown=$USER:$USER /opt/dagger/dagger $HOME/.local/bin/dagger
# fork-manifest:end
# fork-manifest:when aws-emulator
COPY --from=aws-emulator /opt/aws-emulator /opt/aws-emulator
ENV PATH=$PATH:/opt/aws-emulator/bin
# Never report usage from tests
ENV EMULATOR_TELEMETRY=off
# fork-manifest:end
COPY --from=python --chown=$USER:$USER $HOME/.python $HOME/.python
ENV PATH=$PATH:$HOME/.python/bin
# fork-manifest:when go
COPY --from=go --chown=$USER:$USER /usr/local/go $HOME/.go
COPY --from=go --chown=$USER:$USER /go/bin/gopls $HOME/go/bin/gopls
ENV PATH=$PATH:$HOME/.go/bin
# fork-manifest:end
# fork-manifest:when rust
COPY --from=rust --chown=$USER:$USER /usr/local/rustup $HOME/.rustup
COPY --from=rust --chown=$USER:$USER /usr/local/cargo $HOME/.cargo
ENV PATH=$PATH:$HOME/.cargo/bin
# fork-manifest:end
ENV PNPM_HOME="$HOME/.local/share/pnpm"
COPY --from=pnpm --chown=$USER:$USER $PNPM_HOME $PNPM_HOME
# pnpm 11+ installs global binaries (including itself) under `bin`
ENV PATH="$PNPM_HOME/bin:$PATH"
COPY --from=node /usr/local/bin/node /usr/local/bin/node

# Worktree-specific PATH entries (nx, biome, scripts/commands) are set via `remoteEnv`
# in devcontainer.json, since the workspace path differs per worktree.

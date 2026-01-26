# https://github.com/devcontainers/images/blob/main/src/base-debian/history
FROM mcr.microsoft.com/devcontainers/base:1.0.25-debian12

ARG NX_VERSION=22.4.1
ARG NODE_VERSION=24.13.0
ARG PNPM_VERSION=10.28.1
ARG CHANGESETS_VERSION=2.29.8
ARG DAGGER_VERSION=0.18.10
ARG GO_VERSION=1.24.4

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install vim -y

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
ENV PATH="$PNPM_HOME:$PATH"
RUN curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=$PNPM_VERSION SHELL=bash sh -

# Install packages
RUN pnpm i -g "nx@${NX_VERSION}" "@changesets/cli@${CHANGESETS_VERSION}"

# Install Go
ENV PATH=$PATH:$HOME/go/bin
RUN wget https://dl.google.com/go/go${GO_VERSION}.linux-arm64.tar.gz -O /tmp/go.tar.gz && \
    tar -C $HOME -xzf /tmp/go.tar.gz && \
    rm /tmp/go.tar.gz && \
    go install golang.org/x/tools/gopls@latest

# Install dagger
RUN curl -fsSL https://dl.dagger.io/dagger/install.sh | \
    DAGGER_VERSION=${DAGGER_VERSION} BIN_DIR=$HOME/.local/bin sh

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

# Install sapling 
RUN sudo -u $USER /bin/bash -c "/home/linuxbrew/.linuxbrew/bin/brew install sapling"

# Grant permissions to non-root
RUN mkdir -p $HOME/.config/vscode-dev-containers && \
    chown -R $USER:$USER $HOME

# Ensure NX runs at max capacity
RUN NX_PARALLEL="$(nproc --all)" \
    && echo "export NX_PARALLEL=${NX_PARALLEL}" >> $HOME/.bashrc

# Define custom scripts/commands
RUN echo "source ./scripts/commands/*" >> $HOME/.bashrc
# https://github.com/devcontainers/images/blob/main/src/base-debian/history
FROM mcr.microsoft.com/devcontainers/base:1.0.19-debian12

ARG NX_VERSION=20.3.2
ARG NODE_VERSION=22.13.1
ARG PNPM_VERSION=9.15.4
ARG CHANGESETS_VERSION=2.27.11
ARG DAGGER_VERSION=0.15.3
ARG GO_VERSION=1.23.2

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
RUN wget https://dl.google.com/go/go${GO_VERSION}.linux-arm64.tar.gz && \
    tar -C $HOME -xzf go${GO_VERSION}.linux-arm64.tar.gz && \
    go install golang.org/x/tools/gopls@latest

# Install dagger
RUN curl -fsSL https://dl.dagger.io/dagger/install.sh | \
    DAGGER_VERSION=${DAGGER_VERSION} BIN_DIR=$HOME/.local/bin sh

# Grant permissions to non-root
RUN mkdir -p $HOME/.config/vscode-dev-containers && \
    chown -R $USER:$USER $HOME

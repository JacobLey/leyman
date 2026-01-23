# https://github.com/devcontainers/images/blob/main/src/base-debian/history
FROM mcr.microsoft.com/devcontainers/base:1.0.25-debian12

ARG NX_VERSION=21.2.1
ARG NODE_VERSION=24.2.0
ARG PNPM_VERSION=10.12.1
ARG CHANGESETS_VERSION=2.29.4
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

# Install gh (https://github.com/cli/cli/blob/trunk/docs/install_linux.md#debian)
RUN (type -p wget >/dev/null || (apt update && apt install wget -y)) \
	&& mkdir -p -m 755 /etc/apt/keyrings \
	&& out=$(mktemp) && wget -nv -O$out https://cli.github.com/packages/githubcli-archive-keyring.gpg \
	&& cat $out | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
	&& chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
	&& mkdir -p -m 755 /etc/apt/sources.list.d \
	&& echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
	&& apt update \
	&& apt install gh -y

# Install dagger
RUN curl -fsSL https://dl.dagger.io/dagger/install.sh | \
    DAGGER_VERSION=${DAGGER_VERSION} BIN_DIR=$HOME/.local/bin sh

# Grant permissions to non-root
RUN mkdir -p $HOME/.config/vscode-dev-containers && \
    chown -R $USER:$USER $HOME

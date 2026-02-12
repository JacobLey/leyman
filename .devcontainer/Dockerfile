# https://github.com/devcontainers/images/blob/main/src/base-debian/history
FROM mcr.microsoft.com/devcontainers/base:1.0.25-debian12

ARG NODE_VERSION=24.13.0
ARG PNPM_VERSION=10.28.1
ARG DAGGER_VERSION=0.19.11
ARG GO_VERSION=1.25.6

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

# Install Go
ENV PATH=$PATH:$HOME/.go/bin
RUN ARCH="$(dpkg --print-architecture)" && \
    wget https://dl.google.com/go/go${GO_VERSION}.linux-${ARCH}.tar.gz -O /tmp/go.tar.gz && \
    tar -C $HOME -xzf /tmp/go.tar.gz && \
    mv $HOME/go $HOME/.go && \
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

# Install oh-my-zsh https://ohmyz.sh/
RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# Install Claude
ENV CLAUDE_CONFIG_DIR=/workspace/.claude
RUN curl -fsSL https://claude.ai/install.sh | bash

# Grant permissions to non-root
RUN mkdir -p $HOME/.config/vscode-dev-containers && \
    chown -R $USER:$USER $HOME

# Ensure NX runs at max capacity
# Although too many and we risk file overload 
# (and frankly don't usually have infinite tasks that can be parallelized)
RUN NX_PARALLEL="$(nproc --all)" MAX_PARALLEL=8 \
    && echo >> $HOME/.bashrc \
    && echo "export NX_PARALLEL=$((NX_PARALLEL>MAX_PARALLEL ? MAX_PARALLEL : NX_PARALLEL))" >> $HOME/.bashrc

# Define custom scripts/commands
ENV PATH=$PATH:/workspace/leyman/main/node_modules/.bin
RUN echo "source ./scripts/commands/*" >> $HOME/.leymanrc \
    && echo >> $HOME/.bashrc \
    && echo >> $HOME/.zhshrc \
    && echo "source $HOME/.leymanrc" >> $HOME/.bashrc \
    && echo "source $HOME/.leymanrc" >> $HOME/.zshrc
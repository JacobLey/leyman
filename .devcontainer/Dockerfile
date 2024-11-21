FROM mcr.microsoft.com/devcontainers/base:debian

ARG NX_VERSION=20.0.7
ARG NODE_VERSION=22.11.0
ARG PNPM_VERSION=9.13.2
ARG CHANGESETS_VERSION=2.27.9

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
RUN corepack enable && \
    corepack prepare "pnpm@$PNPM_VERSION" --activate

# Install packages
RUN pnpm i -g "nx@${NX_VERSION}" "@changesets/cli@${CHANGESETS_VERSION}"

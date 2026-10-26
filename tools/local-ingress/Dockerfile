# The whole ingress configuration, so a running ingress never depends on a checkout that may be deleted.
# Bump VERSION on any change here, including the base image's digest.
FROM lucaslorentz/caddy-docker-proxy:2.13.1-alpine@sha256:3e6cf4a6382da0cd14108a69929d7f8cc59e9a59cae4c9795071fa392ffa8036

ARG VERSION
LABEL org.opencontainers.image.title="local-ingress" \
      org.opencontainers.image.version="${VERSION}"
ENV LOCAL_INGRESS_VERSION="${VERSION}"

COPY Caddyfile /etc/local-ingress/Caddyfile
COPY help /srv/help

#!/bin/sh
# Runs in the container (devcontainer `postCreateCommand`), once the images it tags have been pulled.
#
# An image pulled as `name:tag@sha256:...` is stored with only its digest, and Docker counts any image without a tag as
# dangling, so `docker image prune` and OrbStack would offer to delete images the next rebuild downloads again. Tagging
# them marks them as in use. The image store is shared by every worktree, so this only does anything after a pin changes.
#
# Never blocks the container from starting: a pin that isn't stored locally is skipped, as is everything without Docker.
cd "$(dirname "$0")/.." || exit 0

grep -ohE '[a-z0-9./_-]+:[A-Za-z0-9._-]+@sha256:[0-9a-f]{64}' .devcontainer/Dockerfile tools/local-ingress/Dockerfile |
    while read -r ref; do
        name="${ref%%:*}"
        tag="${ref#*:}"
        tag="${tag%@*}"
        docker tag "$name@${ref##*@}" "$name:$tag" 2> /dev/null || true
    done

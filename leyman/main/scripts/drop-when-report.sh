#!/usr/bin/env sh

# Reports which drop-when markers in this repository are due, with a release at least 7 days old, matching
# `minimumReleaseAge` in pnpm-workspace.yaml. The paths left out are the ones `drop-when-check` leaves out (nx.json).
# A token only raises GitHub's rate limit, so without GITHUB_TOKEN it takes gh's, when gh is logged in.

set -e

if [ -z "${GITHUB_TOKEN:-}" ] && token=$(gh auth token 2>/dev/null); then
    export GITHUB_TOKEN="$token"
fi

exec leyman/main/node_modules/.bin/drop-when report --min-age 7d ':!apps/drop-when' ':!pnpm-lock.yaml' "$@"

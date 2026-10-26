#!/bin/sh
# Runs on the HOST (devcontainer `initializeCommand`) before the container starts.
#
# The main checkout stays wherever it was cloned. Worktrees live in one dedicated
# sibling folder named after it, so they never collide with other projects:
#
#   ~/code/leyman/                    <- main checkout (owns .git)
#   ~/code/leyman-worktrees/
#     <branch>/                       <- git worktrees
#     .shared/                        <- pnpm store, Nx cache, Claude and gh config, plans
#
# Both folders are bind-mounted into the container at the SAME absolute paths as on the
# host, so git's absolute worktree links resolve on both sides. This writes those paths
# to `.devcontainer/.env`, which docker compose reads for variable substitution.
set -eu

cd "$(dirname "$0")/.."
worktree="$(pwd -P)"
common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
main_checkout="$(dirname "$common_dir")"
worktrees_dir="${main_checkout}-worktrees"
shared="$worktrees_dir/.shared"

if [ "$worktree" != "$main_checkout" ] && [ "$(dirname "$worktree")" != "$worktrees_dir" ]; then
    echo "error: worktree $worktree must live in $worktrees_dir" >&2
    echo "       create worktrees with: scripts/worktree new <branch>" >&2
    exit 1
fi

mkdir -p "$shared/nx-cache"

# One-time migration of state that used to live inside the main checkout
if [ ! -e "$shared/pnpm-store" ] && [ -d "$main_checkout/.pnpm-store" ]; then
    echo "Moving $main_checkout/.pnpm-store -> $shared/pnpm-store"
    mv "$main_checkout/.pnpm-store" "$shared/pnpm-store"
fi
if [ ! -e "$shared/claude-config" ] && [ -d "$main_checkout/.claude-config" ]; then
    # Copy rather than move: a running session may still be using the old location
    echo "Copying $main_checkout/.claude-config -> $shared/claude-config"
    cp -R "$main_checkout/.claude-config" "$shared/claude-config"
fi
mkdir -p "$shared/pnpm-store" "$shared/claude-config" "$shared/gh-config"

# Plans shared by every worktree, kept out of git: `plans` is a gitignored symlink
mkdir -p "$shared/plans"
if [ ! -e plans ] && [ ! -L plans ]; then
    ln -s "$shared/plans" plans
fi

# Namespace the compose project by repo so same-named worktrees in other repos don't clash
project="$(basename "$main_checkout")"
if [ "$worktree" != "$main_checkout" ]; then
    project="${project}_$(basename "$worktree")"
fi
project="$(printf '%s' "$project" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_-' '-')"

# DNS labels for this worktree's URL, `https://<worktree>.<repo>.localhost`: at most 63 characters of
# `a-z0-9-`, not starting or ending with `-`. The main checkout is `main`.
dns_label() {
    printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-' | cut -c 1-63 | sed 's/^-*//; s/-*$//'
}
repo_name="$(dns_label "$(basename "$main_checkout")")"
worktree_name=main
if [ "$worktree" != "$main_checkout" ]; then
    worktree_name="$(dns_label "$(basename "$worktree")")"
fi

{
    printf 'MAIN_CHECKOUT="%s"\n' "$main_checkout"
    printf 'WORKTREES_DIR="%s"\n' "$worktrees_dir"
    printf 'COMPOSE_PROJECT_NAME="%s"\n' "$project"
    printf 'REPO_NAME="%s"\n' "$repo_name"
    printf 'WORKTREE_NAME="%s"\n' "$worktree_name"
} > .devcontainer/.env

# The machine's shared HTTPS ingress (tools/local-ingress). Never blocks the container from starting: without it,
# only the URL above doesn't load. The network must exist either way, as the container joins it.
if ! sh tools/local-ingress/ensure; then
    echo "warning: local-ingress didn't start, so https://$worktree_name.$repo_name.localhost won't load." >&2
    echo "         See tools/local-ingress/README.md, then run tools/local-ingress/ensure." >&2
    docker network inspect local-ingress > /dev/null 2>&1 || docker network create local-ingress > /dev/null 2>&1 || true
fi

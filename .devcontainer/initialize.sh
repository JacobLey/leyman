#!/bin/sh
# Runs on the HOST (devcontainer `initializeCommand`) before the container starts.
#
# The main checkout stays wherever it was cloned. Worktrees live in one dedicated
# sibling folder named after it, so they never collide with other projects:
#
#   ~/code/leyman/                    <- main checkout (owns .git)
#   ~/code/leyman-worktrees/
#     <branch>/                       <- git worktrees
#     .shared/                        <- pnpm store, Nx cache, Claude config
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
mkdir -p "$shared/pnpm-store" "$shared/claude-config"

# Namespace the compose project by repo so same-named worktrees in other repos don't clash
project="$(basename "$main_checkout")"
if [ "$worktree" != "$main_checkout" ]; then
    project="${project}_$(basename "$worktree")"
fi
project="$(printf '%s' "$project" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_-' '-')"

{
    printf 'MAIN_CHECKOUT="%s"\n' "$main_checkout"
    printf 'WORKTREES_DIR="%s"\n' "$worktrees_dir"
    printf 'COMPOSE_PROJECT_NAME="%s"\n' "$project"
} > .devcontainer/.env

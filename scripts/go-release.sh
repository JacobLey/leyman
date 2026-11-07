#!/usr/bin/env bash

# Releases Go modules by tag: go-release.sh check|tag <remote>
#
# A released Go module has a VERSION file, and is released by the tag `<directory>/v<VERSION>`, which the Go proxy
# caches for good. For each one:
# - It must have the `check-go-release` target, which checks its VERSION, CHANGELOG and requires.
# - If its tag exists, what consumers build (its non-test `.go` files, `go.mod`, `go.sum` and VERSION) must not have
#   changed since, or they would get the tagged code while this commit tests other code: bump its VERSION.
# `check` only checks, run by CI's `test` job so a pull request fails before merge. `tag` also tags each module whose
# tag doesn't exist yet, in one atomic push, run by the `publish` job on main.

set -euo pipefail

if [ "$#" -ne 2 ] || { [ "$1" != check ] && [ "$1" != tag ]; }; then
    echo "Usage: go-release.sh check|tag <remote>"
    exit 1
fi
mode=$1
remote=$2

existing=$(git ls-remote --tags "$remote" | sed 's|.*refs/tags/||')
new=()
stale=()

for file in $(git ls-files '*/VERSION'); do
    directory=$(dirname "$file")
    if [ ! -f "$directory/go.mod" ]; then
        continue
    fi
    if ! grep -q '"check-go-release"' "$directory/project.json"; then
        echo "$directory has a VERSION but no check-go-release target in its project.json"
        exit 1
    fi

    tag="$directory/v$(cat "$file")"
    if ! printf '%s\n' "$existing" | grep -qxF "$tag"; then
        new+=("$tag")
        continue
    fi

    # Only the tag's commit, without making a full clone shallow
    depth=()
    if [ "$(git rev-parse --is-shallow-repository)" = true ]; then
        depth=(--depth=1)
    fi
    git fetch --quiet --no-tags "${depth[@]}" "$remote" "refs/tags/$tag"
    if ! git diff --quiet FETCH_HEAD HEAD -- \
        ":(glob)$directory/**/*.go" ":(exclude,glob)$directory/**/*_test.go" \
        "$directory/go.mod" "$directory/go.sum" "$directory/VERSION"; then
        stale+=("$tag")
    fi
done

if [ "$mode" = tag ] && [ "${#new[@]}" -gt 0 ]; then
    refs=()
    for tag in "${new[@]}"; do
        git tag "$tag"
        refs+=("refs/tags/$tag")
    done
    git push --atomic "$remote" "${refs[@]}"
    printf 'tagged %s\n' "${new[@]}"
fi

if [ "${#stale[@]}" -gt 0 ]; then
    printf '%s is released, and its code changed since: bump its VERSION\n' "${stale[@]}"
    exit 1
fi

#!/usr/bin/env bash

set -e

usage='Usage: leyman-biome-format

Formats the current directory with Biome, writing the changes. In CI (CI set, and not "false" or "0"), only checks.'

# Takes no arguments: a typo'd flag must not fall through to rewriting every file.
for arg in "$@"; do
    case "$arg" in
        -h | --help)
            echo "$usage"
            exit 0
            ;;
    esac
done
if [ $# -gt 0 ]; then
    printf 'leyman-biome-format: unexpected argument "%s"\n\n%s\n' "$1" "$usage" >&2
    exit 2
fi

# Formatting is part of `prepare`, so it rewrites source by default.
# In CI it only checks, failing if anything was committed unformatted.
case "${CI:-false}" in
    false | 0 | "") biome format --write . ;;
    *) biome format . ;;
esac

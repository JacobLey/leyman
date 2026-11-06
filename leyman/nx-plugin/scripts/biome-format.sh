#!/usr/bin/env bash

set -e

# Formatting is part of `prepare`, so it rewrites source by default.
# In CI it only checks, failing if anything was committed unformatted.
case "${CI:-false}" in
    false | 0 | "") biome format --write . ;;
    *) biome format . ;;
esac

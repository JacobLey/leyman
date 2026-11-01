#!/usr/bin/env bash

set -e

# Writes the code the module compiles against, which is gitignored. In CI the Dagger module overlays it instead
# (`New` in `dagger/main.go`), as nothing inside Dagger can reach the engine.
case "${CI:-false}" in
    false | 0 | "") dagger develop ;;
    *) ;;
esac

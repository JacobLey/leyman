#!/usr/bin/env bash

set -e

# Formatting is part of `prepare`, so it rewrites source by default.
# In CI it only checks, failing if anything was committed unformatted.
case "${CI:-false}" in
    false | 0 | "") gofmt -l -w . ;;
    *)
        unformatted="$(gofmt -l .)"
        if [ -n "$unformatted" ]; then
            echo "Not formatted with gofmt:"
            echo "$unformatted"
            exit 1
        fi
        ;;
esac

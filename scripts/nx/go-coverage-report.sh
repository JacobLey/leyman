#!/usr/bin/env bash

set -e

# `go-test` writes Go's own coverage profile (c8 only sees JavaScript), held to 100% like `coverage-report`
total="$(go tool cover -func=cover.out | tail -n 1 | awk '{ print $NF }')"
if [ "$total" != "100.0%" ]; then
    echo "Go coverage is $total, expected 100.0%:"
    go tool cover -func=cover.out | grep -v '100.0%$'
    exit 1
fi
echo "Go coverage is 100.0%"

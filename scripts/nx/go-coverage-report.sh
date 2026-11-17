#!/usr/bin/env bash

set -e

# `go-test` writes Go's own coverage profile (c8 only sees JavaScript), held to 100% like `coverage-report`.
#
# Generated files (marked as https://pkg.go.dev/cmd/go#hdr-Generate_Go_files_by_processing_source says) are left
# out: their generator's own tests cover the code it writes, as golangci-lint leaves them to it too.
profile="$(mktemp)"
trap 'rm -f "$profile"' EXIT
module="$(go list -m)"
generated="$(grep -rlE --include='*.go' '^// Code generated .* DO NOT EDIT\.$' . | sed "s|^\./|$module/|" || true)"
if [ -n "$generated" ]; then
    # Profile lines are `<module>/<file>:<range> <statements> <count>`, after a `mode:` line
    grep -vF -f <(printf '%s:\n' $generated) cover.out > "$profile"
else
    cp cover.out "$profile"
fi

total="$(go tool cover -func="$profile" | tail -n 1 | awk '{ print $NF }')"
if [ "$total" != "100.0%" ]; then
    echo "Go coverage is $total, expected 100.0%:"
    go tool cover -func="$profile" | grep -v '100.0%$'
    exit 1
fi
echo "Go coverage is 100.0%"

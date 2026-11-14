#!/usr/bin/env bash

# Clears ./dist before a build, but keeps what lets `tsc` skip unchanged files: its build info and the declarations.
# `tsc` trusts the build info without checking its outputs, so a declaration deleted beside a kept build info is
# never written again, and the build still passes. So they stay together, only while the declarations are exactly
# those of the current sources. Any difference, such as a deleted source's leftover, clears everything.

set -e

usage='Usage: leyman-clean-dist

Clears ./dist, keeping the tsc build info and declarations while they are exactly those of the sources in ./src.'

for arg in "$@"; do
    case "$arg" in
        -h | --help)
            echo "$usage"
            exit 0
            ;;
    esac
done
if [ $# -gt 0 ]; then
    printf 'leyman-clean-dist: unexpected argument "%s"\n\n%s\n' "$1" "$usage" >&2
    exit 2
fi

if [ ! -d dist ]; then
    exit 0
fi

expected=$(find src -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.mts' -o -name '*.cts' \) \
    ! -name '*.d.ts' ! -name '*.d.mts' ! -name '*.d.cts' |
    sed -E 's#^src/##; s#\.tsx?$#.d.ts#; s#\.mts$#.d.mts#; s#\.cts$#.d.cts#' | LC_ALL=C sort)
actual=$(find dist -type f \( -name '*.d.ts' -o -name '*.d.mts' -o -name '*.d.cts' \) |
    sed -E 's#^dist/##' | LC_ALL=C sort)

if [ -f dist/tsconfig.tsbuildinfo ] && [ "$expected" = "$actual" ]; then
    find dist -type f ! -name tsconfig.tsbuildinfo \
        ! -name '*.d.ts' ! -name '*.d.mts' ! -name '*.d.cts' \
        ! -name '*.d.ts.map' ! -name '*.d.mts.map' ! -name '*.d.cts.map' -delete
else
    rm -rf dist
fi

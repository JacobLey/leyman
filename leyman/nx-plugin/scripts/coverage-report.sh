#!/usr/bin/env bash

# Checks a project's coverage from its test targets: leyman-coverage-report <c8rc> [c8 options...].

set -e

config_file=$1
shift

COVERAGE_DIR="$NX_WORKSPACE_ROOT/.coverage/project/$NX_TASK_TARGET_PROJECT"
COVERAGE_TMP="$COVERAGE_DIR/report-tmp"

# Each test target writes to its own sub-directory (so they can be cached independently),
# but c8 only reads the top level of its temp directory, so flatten into a single directory.
rm -rf "$COVERAGE_TMP"
mkdir -p "$COVERAGE_TMP"
find "$COVERAGE_DIR/tmp" -maxdepth 2 -name "*.json" -exec cp {} "$COVERAGE_TMP/" \;

# lcov paths are from the workspace root: Coverage Gutters matches a file by the end of its path, so
# `src/index.ts`, relative to the package, would show this package's coverage on every package's index.ts.
c8 --temp-directory="$COVERAGE_TMP" -o "$COVERAGE_DIR/report" -c "$config_file" \
    --reporter-options.lcovonly.projectRoot="$NX_WORKSPACE_ROOT" report --all --check-coverage --merge-async "$@"

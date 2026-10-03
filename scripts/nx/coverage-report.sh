#!/usr/bin/env bash

set -e

COVERAGE_DIR="$NX_WORKSPACE_ROOT/.coverage/project/$NX_TASK_TARGET_PROJECT"
COVERAGE_TMP="$COVERAGE_DIR/report-tmp"

# Each test target writes to its own sub-directory (so they can be cached independently),
# but c8 only reads the top level of its temp directory, so flatten into a single directory.
rm -rf "$COVERAGE_TMP"
mkdir -p "$COVERAGE_TMP"
find "$COVERAGE_DIR/tmp" -maxdepth 2 -name "*.json" -exec cp {} "$COVERAGE_TMP/" \;

c8 --temp-directory="$COVERAGE_TMP" -o "$COVERAGE_DIR/report" -c "$NX_WORKSPACE_ROOT/configs/c8rc.json" report --all --check-coverage --merge-async

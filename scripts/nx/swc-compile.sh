#!/usr/bin/env bash

# Compiles a directory of TypeScript with SWC: swc-compile.sh <source> <output>.
# `.mts` and `.cts` need a pass each, for their extension and module type. Starting SWC costs over 100ms,
# and few packages have either, so those passes only run when there is a file for them.

set -e

source_dir=$1
output_dir=$2

compile() {
    swc "$source_dir" -d "$output_dir" --config-file "$NX_WORKSPACE_ROOT/configs/swcrc.jsonc" --strip-leading-paths "$@"
}

has_files() {
    [ -n "$(find "$source_dir" \( -name "*.$1" -o -name "*.${1}x" \) -print -quit)" ]
}

compile --only '**/*.ts?(x)'

if has_files mts; then
    compile --only '**/*.mts?(x)' --out-file-extension mjs
fi

if has_files cts; then
    compile -C module.type=commonjs -C module.ignoreDynamic=true -C module.exportInteropAnnotation=true \
        --only '**/*.cts?(x)' --out-file-extension cjs
fi

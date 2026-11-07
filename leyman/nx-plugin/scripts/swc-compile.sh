#!/usr/bin/env bash

# Compiles a directory of TypeScript with SWC: leyman-swc-compile <source> <output> <swcrc>.
# `.mts` and `.cts` need a pass each, for their extension and module type. Starting SWC costs over 100ms,
# and few packages have either, so those passes only run when there is a file for them.
#
# The target follows the oldest Node.js the package supports: the major version of `engines.node` in the current
# directory's package.json. A floor older than the running Node.js compiles to that version's ES year, so the output
# runs there; otherwise, or without `engines`, the target is `esnext`.

set -e

source_dir=$1
output_dir=$2
config_file=$3

target=$(node -e '
    const { readFileSync } = require("node:fs");
    const range = JSON.parse(readFileSync("package.json", "utf8")).engines?.node;
    const floor = Number(/^>=\s*(\d+)/v.exec(range ?? "")?.[1]);
    // SWC has no target past es2024 yet. Node.js 24 runs all the syntax SWC compiles (ES2025, and `using`), so its
    // floor keeps `esnext`: es2024 would compile away `using`
    const targets = { 22: "es2024", 24: "esnext" };
    if (range === undefined || floor >= Number(process.versions.node.split(".")[0])) {
        console.log("esnext");
    } else if (floor in targets) {
        console.log(targets[floor]);
    } else {
        console.error(`leyman-swc-compile: no target for engines.node "${range}"; add its floor to the table`);
        process.exit(1);
    }
')

compile() {
    swc "$source_dir" -d "$output_dir" --config-file "$config_file" \
        -C "jsc.target=$target" --strip-leading-paths "$@"
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

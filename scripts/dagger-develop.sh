#!/usr/bin/env bash

find ./dagger -name go.mod \
    -exec sh -c ' \
        head -n 1 "$1" | \
        grep -q "^module dagger/" && \
        sed -i "/^go 1\.23\.0$/q" "$1" \
    ' _ {} \;

find ./dagger -name go.sum \
    -exec sh -c '> "$1"' _ {} \;

# Helper script to "recursively" setup all dagger modules for local development
dagger develop --mod ./dagger/modules/debian
dagger develop --mod ./dagger/modules/go-lang
dagger develop --mod ./dagger/modules/node
dagger develop --mod ./dagger/modules/pnpm
dagger develop --mod ./dagger/executors/barrelify
dagger develop --mod ./dagger/executors/biome
dagger develop --mod ./dagger/executors/eslint
dagger develop --mod ./dagger/executors/mocha-c8
dagger develop --mod ./dagger/executors/node-deploy
dagger develop --mod ./dagger/executors/node-install
dagger develop --mod ./dagger/executors/populate-files
dagger develop --mod ./dagger/executors/tsc
dagger develop --mod ./dagger/executors/update-ts-references
dagger develop --mod ./dagger/monorepo
dagger develop --mod ./dagger/monorepo/monorepo-builder
dagger develop --mod ./dagger/test-and-build
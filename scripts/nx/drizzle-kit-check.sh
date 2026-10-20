#!/usr/bin/env bash

set -e

# Fails if the Drizzle schema has changes that no migration covers, or if the migrations conflict.
# Migrations are reviewed files with names, so this never writes one: run `drizzle-kit generate --name <name>`.
# drizzle-kit has no check-only mode for this, so it generates into the real directory, then puts it back.

drizzle-kit check

backup="$(mktemp -d)"
cp -R migrations "$backup/migrations"
restore() {
    rm -rf migrations
    mv "$backup/migrations" migrations
    rm -rf "$backup"
}
trap restore EXIT

drizzle-kit generate > /dev/null

if ! diff -r "$backup/migrations" migrations > /dev/null; then
    echo "The Drizzle schema has changes that no migration covers. Run: drizzle-kit generate --name <name>" >&2
    exit 1
fi

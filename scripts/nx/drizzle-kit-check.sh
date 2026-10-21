#!/usr/bin/env bash

set -euo pipefail

# Fails if the Drizzle schema has changes that no migration covers, or if the migrations conflict.
# Migrations are reviewed files with names, so this never writes one: run `drizzle-kit generate --name <name>`.
# drizzle-kit has no check-only mode for this, so it generates into a copy of the migrations, and compares.

drizzle-kit check

config="$(compgen -G 'drizzle.config.*' | head -n 1)"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
cp -R migrations "$scratch/migrations"

# The project's config, generating into the copy. drizzle-kit resolves `out` against the working directory (and
# prefixes it with `./`, which breaks an absolute path), so it is relative.
out="$(realpath --relative-to="$PWD" "$scratch/migrations")"
cat > "$scratch/$config" <<EOF
import config from '$PWD/$config';
export default { ...config, out: '$out' };
EOF

# drizzle-kit exits 0 even when it fails, e.g. when it would ask whether a column was renamed, which it can't
# without a terminal. So any error output fails the check, rather than pass with nothing generated.
if ! drizzle-kit generate --config "$scratch/$config" < /dev/null > "$scratch/output.log" 2> "$scratch/errors.log" ||
    [ -s "$scratch/errors.log" ]; then
    cat "$scratch/output.log" "$scratch/errors.log" >&2
    echo "drizzle-kit generate failed. If it asks about a rename, run: drizzle-kit generate --name <name>" >&2
    exit 1
fi

if ! diff -r migrations "$scratch/migrations" > /dev/null; then
    echo "The Drizzle schema has changes that no migration covers. Run: drizzle-kit generate --name <name>" >&2
    exit 1
fi

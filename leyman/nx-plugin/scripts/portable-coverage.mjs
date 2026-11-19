#!/usr/bin/env node

// V8 coverage records absolute paths: each script's `file://` URL, and the keys and contents of its
// `source-map-cache`. Nx's task hash doesn't include the workspace's path, so a cached test result
// built at another path (a CI container, another checkout) is restored as is, and `c8 report` can't
// match its paths to the files here.
//
// So the test targets `store` their coverage with the workspace root replaced by a fixed placeholder,
// making the cached files the same wherever they were built, and `leyman-coverage-report` `restores`
// the current root into its copy just before reporting.
//
// A plain text replacement, since V8 writes paths without escaping them. The root is matched with its
// trailing slash, so `/a/b` never rewrites a path in `/a/bc`. Only the `*.json` files directly in the
// directory are rewritten: c8 reads no others.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const usage = `Usage: leyman-portable-coverage <store|restore> <dir>

store:   replaces $NX_WORKSPACE_ROOT in the V8 coverage files in <dir> with a fixed placeholder,
         so they don't depend on where the workspace is.
restore: replaces the placeholder with the current $NX_WORKSPACE_ROOT.`;

const fail = message => {
    process.stderr.write(`leyman-portable-coverage: ${message}\n\n${usage}\n`);
    process.exitCode = 2;
    // eslint-disable-next-line n/no-process-exit -- Stop before rewriting anything
    process.exit();
};

const args = process.argv.slice(2);
if (args.some(arg => arg === '-h' || arg === '--help')) {
    process.stdout.write(`${usage}\n`);
    // eslint-disable-next-line n/no-process-exit -- Stop before rewriting anything
    process.exit();
}
const [mode, dir] = args;
if (mode !== 'store' && mode !== 'restore') {
    fail(`the first argument must be "store" or "restore", not "${mode ?? ''}"`);
}
if (args.length !== 2) {
    fail('expects exactly a mode and a directory');
}

const workspaceRoot = process.env.NX_WORKSPACE_ROOT;
const localRoot = workspaceRoot ? path.join(path.resolve(workspaceRoot), '/') : '';
// `/` would match the start of every path, and the `//` of every `file://` URL
if (localRoot === '/' || !workspaceRoot || !path.isAbsolute(workspaceRoot)) {
    fail(`NX_WORKSPACE_ROOT must be an absolute path other than /, not "${workspaceRoot ?? ''}"`);
}
// Not a path any workspace would be at, so restoring can't touch a real one
const placeholderRoot = '/__leyman_workspace_root__/';

const [from, to] = mode === 'store' ? [localRoot, placeholderRoot] : [placeholderRoot, localRoot];

const entries = readdirSync(dir, { withFileTypes: true });
for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
    }
    const file = path.join(dir, entry.name);
    const content = readFileSync(file, 'utf8');
    // Split and join: `replaceAll` would read `$` in the replacement as a pattern
    const rewritten = content.split(from).join(to);
    if (rewritten !== content) {
        writeFileSync(file, rewritten);
    }
}

#!/usr/bin/env node

// Workspace dependencies are injected (`injectWorkspacePackages`): each dependent gets a copy of the
// package's published files in the virtual store, made at install time. Those copies don't follow
// later builds, or Nx restoring `dist/` from cache, so mirror the package into them after every build.
//
// Never cached: dependents' cache keys hash this package's build output, so they must never run against a stale copy.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.env.NX_WORKSPACE_ROOT;
const projectRoot = process.cwd();

// Exactly the files pnpm would publish, and so inject
const { name, files } = JSON.parse(execFileSync('pnpm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' }));
const packed = new Set(files.map(file => file.path));

// pnpm names each copy `<name>@file+<path>`, with `/` replaced by `+`, plus a suffix for its resolved peers
const prefix = `${name.replace('/', '+')}@file+${path.relative(workspaceRoot, projectRoot).replaceAll(path.sep, '+')}`;
const virtualStore = path.join(workspaceRoot, 'node_modules', '.pnpm');
const copies = readdirSync(virtualStore)
    .filter(dir => dir === prefix || dir.startsWith(`${prefix}_`))
    .map(dir => path.join(virtualStore, dir, 'node_modules', name));

const isSameFile = (source, target) => {
    try {
        return statSync(source).size === statSync(target).size && readFileSync(source).equals(readFileSync(target));
    } catch {
        return false;
    }
};

for (const copy of copies) {
    for (const entry of readdirSync(copy, { recursive: true, withFileTypes: true })) {
        const file = path.relative(copy, path.join(entry.parentPath, entry.name));
        if (!entry.isDirectory() && !packed.has(file)) {
            rmSync(path.join(copy, file));
        }
    }
    // Deepest first, so a directory emptied by removing its children is removed too
    const dirs = readdirSync(copy, { recursive: true, withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(entry.parentPath, entry.name))
        .sort((a, b) => b.length - a.length);
    for (const dir of dirs) {
        if (readdirSync(dir).length === 0) {
            rmdirSync(dir);
        }
    }
    for (const file of packed) {
        const source = path.join(projectRoot, file);
        const target = path.join(copy, file);
        if (!isSameFile(source, target)) {
            mkdirSync(path.dirname(target), { recursive: true });
            copyFileSync(source, target);
        }
    }
}

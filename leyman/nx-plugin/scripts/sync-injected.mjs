#!/usr/bin/env node

// Workspace dependencies are injected (`injectWorkspacePackages`): each dependent gets a copy of the
// package's published files in the virtual store, made at install time. Those copies don't follow
// later builds, or Nx restoring `dist/` from cache, so mirror the package into them after every build.
//
// Declaration maps aren't published, but each copy gets one pointing back at this package's source,
// so editors' go-to-definition opens the workspace source instead of the copied `.d.ts`.
//
// Never cached: dependents' cache keys hash this package's build output, so they must never run against a stale copy.
//
// Also writes the fields of package.json that can affect a dependent, which dependents hash in place of
// the file, so a version bump or a new description doesn't rerun them. Inert fields are listed rather than
// consumed ones, so a field nobody thought about still invalidates.

import { execFileSync } from 'node:child_process';
import {
    copyFileSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.env.NX_WORKSPACE_ROOT;
const projectRoot = process.cwd();

const inertFields = new Set([
    'author',
    'bugs',
    'description',
    'devDependencies',
    'homepage',
    'keywords',
    'license',
    'repository',
    'scripts',
    'version',
]);
const packageJson = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const surface = Object.fromEntries(
    Object.entries(packageJson).filter(([field]) => !inertFields.has(field))
);
const surfacePath = path.join(
    workspaceRoot,
    '.package-surface',
    process.env.NX_TASK_TARGET_PROJECT,
    'package-surface.json'
);
mkdirSync(path.dirname(surfacePath), { recursive: true });
writeFileSync(surfacePath, `${JSON.stringify(surface, null, 2)}\n`);

// Exactly the files pnpm would publish, and so inject
const { name, files } = JSON.parse(
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- Run the workspace's pnpm, like Nx itself
    execFileSync('pnpm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' })
);
const packed = new Set(files.map(file => file.path));

// Each copy is named `<name>@file+<path>` by pnpm, with `/` replaced by `+`, plus a suffix for its resolved peers
const prefix = `${name.replace('/', '+')}@file+${path.relative(workspaceRoot, projectRoot).replaceAll(path.sep, '+')}`;
const virtualStore = path.join(workspaceRoot, 'node_modules', '.pnpm');
const copies = readdirSync(virtualStore)
    .filter(dir => dir === prefix || dir.startsWith(`${prefix}_`))
    .map(dir => path.join(virtualStore, dir, 'node_modules', name));

const isSameFile = (source, target) => {
    try {
        return (
            statSync(source).size === statSync(target).size &&
            readFileSync(source).equals(readFileSync(target))
        );
    } catch {
        return false;
    }
};

const declarationMaps = [...packed]
    .filter(file => /\.d\.[cm]?ts$/v.test(file))
    .map(file => `${file}.map`)
    .filter(file => {
        try {
            return statSync(path.join(projectRoot, file)).isFile();
        } catch {
            return false;
        }
    });
const expected = new Set([...packed, ...declarationMaps]);

// Map sources are relative to the map, so re-resolve them from the copy back to this package
const redirectDeclarationMap = (source, target) => {
    const map = JSON.parse(readFileSync(source, 'utf8'));
    const sourceDir = path.resolve(path.dirname(source), map.sourceRoot ?? '');
    map.sourceRoot = '';
    map.sources = map.sources.map(file =>
        path.relative(path.dirname(target), path.resolve(sourceDir, file)).replaceAll(path.sep, '/')
    );
    const content = JSON.stringify(map);
    try {
        if (readFileSync(target, 'utf8') === content) {
            return;
        }
    } catch {
        // No map there yet: write it
    }
    writeFileSync(target, content);
};

for (const copy of copies) {
    const entries = readdirSync(copy, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
        const file = path.relative(copy, path.join(entry.parentPath, entry.name));
        if (!entry.isDirectory() && !expected.has(file)) {
            rmSync(path.join(copy, file));
        }
    }
    // Deepest first, so a directory emptied by removing its children is removed too
    const dirs = readdirSync(copy, { recursive: true, withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(entry.parentPath, entry.name))
        .toSorted((a, b) => b.length - a.length);
    for (const dir of dirs) {
        if (readdirSync(dir).length === 0) {
            rmdirSync(dir);
        }
    }
    for (const file of packed) {
        const source = path.join(projectRoot, file);
        const target = path.join(copy, file);
        if (isSameFile(source, target)) {
            continue;
        }
        mkdirSync(path.dirname(target), { recursive: true });
        copyFileSync(source, target);
    }
    for (const file of declarationMaps) {
        redirectDeclarationMap(path.join(projectRoot, file), path.join(copy, file));
    }
}

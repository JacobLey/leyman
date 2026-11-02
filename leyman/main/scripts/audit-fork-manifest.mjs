// Proves `fork-manifest.json` by using it: applies it to a temporary directory with one real package, installs that from
// nothing, and runs `verify` there, as a fork's first day would. `check-fork-manifest.mjs` catches a wrong classification
// on every run; this catches what only shows up when things run. It takes minutes, so it is never part of `verify`: Nx's
// `fork-manifest-audit` target and a weekly workflow run it.
//
//   node audit-fork-manifest.mjs [--with go,rust,...] [--keep]

import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { apply, inspect } from './fork-manifest.mjs';

const samplePackage = 'tools/parse-cwd';
const millisecondsPerSecond = 1000;

const { values } = parseArgs({
    options: {
        keep: { default: false, type: 'boolean' },
        with: { type: 'string' },
    },
});
const conditions = values.with?.split(',') ?? [];
const tempRoot = realpathSync(tmpdir());
const to = mkdtempSync(path.join(tempRoot, 'fork-manifest-audit-'));

const outerEnv = Object.entries(process.env).filter(([key]) => !key.startsWith('NX_'));
// Isolated from the Nx run that started this, and from every cache: the point is a run from nothing
const env = {
    ...Object.fromEntries(outerEnv),
    CI: 'true',
    NX_DAEMON: 'false',
    NX_NO_CLOUD: 'true',
    NX_SKIP_NX_CACHE: 'true',
    PATH: `${path.join(to, 'leyman/main/node_modules/.bin')}:${process.env.PATH}`,
};

const run = (label, command, ...args) => {
    const start = performance.now();
    console.log(`\n=== ${label}: ${command} ${args.join(' ')}`);

    const { error, status } = spawnSync(command, args, { env, cwd: to, stdio: 'inherit' });
    if (error !== undefined || status !== 0) {
        throw new Error(`${label} failed in ${to}`, { cause: error });
    }
    console.log(
        `=== ${label}: ${Math.round((performance.now() - start) / millisecondsPerSecond)}s`
    );
};

try {
    const { files } = apply({ conditions, to, extraPackages: [samplePackage] });
    const problems = inspect({ conditions, files, to });
    if (problems.length > 0) {
        throw new Error(problems.join('\n'));
    }
    console.log(`Applied ${files.length} files to ${to}`);

    run('Git', 'git', 'init', '--quiet');
    run('Install', 'pnpm', 'install', '--no-frozen-lockfile');
    // With auto-fix, because import order depends on what is in the workspace, and the sample's imports just moved to npm
    run('Verify', 'nx', 'run-many', '-t', 'verify', '-c', 'fix', '--outputStyle', 'static');
    // The lifecycle targets the manifest cut down must be exactly what the fork's own lifecycle.json generates
    run('Stage', 'git', 'add', '--all');
    run('Lifecycle', 'nx', 'run', '@leyman/main:lifecycle', '--outputStyle', 'static');
    run('Lifecycle drift', 'git', 'diff', '--exit-code', '--', '*.json');
} finally {
    if (!values.keep) {
        rmSync(to, { force: true, recursive: true });
    }
}

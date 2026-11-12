// Proves `fork-manifest.json` by using it: applies it to a temporary directory with one real package, installs that from
// nothing, and runs `verify` there, as a fork's first day would. `check-fork-manifest.mjs` catches a wrong classification
// on every run; this catches what only shows up when things run. It takes minutes, so it is never part of `verify`: Nx's
// `fork-manifest-audit` target and a weekly workflow run it.
//
//   node audit-fork-manifest.mjs [--with go,rust,...] [--keep]

import { spawnSync } from 'node:child_process';
import {
    appendFileSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { apply, drift, inspect, resync } from './fork-manifest.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');

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

/**
 * Lets the install take this repository's own packages the day they are released. The fork's `minimumReleaseAge` is for
 * what others publish: the audit proves the manifest, not that a fork waits a week after a release of ours.
 *
 * @returns The names of the packages this repository publishes
 */
const publishedNames = () => {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- the checkout's own Git, in a script run by hand or CI
    const manifests = spawnSync('git', ['ls-files', '*package.json'], {
        cwd: repositoryRoot,
        encoding: 'utf8',
    }).stdout.split('\n');
    return manifests
        .filter(file => file !== '')
        .map(file => JSON.parse(readFileSync(path.join(repositoryRoot, file), 'utf8')))
        .filter(({ name, private: isPrivate }) => name !== undefined && isPrivate !== true)
        .map(({ name }) => name);
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
    const sinceApply = drift(to);
    const problems = [
        ...inspect({ conditions, files, to }),
        ...sinceApply.changed.map(({ file }) => `Drift right after apply: ${file} changed`),
        ...sinceApply.added.map(file => `Drift right after apply: ${file} is new`),
    ];
    // A file at a manifest path that the fork wrote itself stays its own through a resync
    const upstreamPath = path.join(to, 'leyman-upstream.json');
    const recorded = readFileSync(upstreamPath, 'utf8');
    const record = JSON.parse(recorded);
    const ownFile = 'AGENTS.md';
    writeFileSync(
        upstreamPath,
        JSON.stringify({ ...record, files: record.files.filter(file => file !== ownFile) })
    );
    resync(to);
    const resynced = JSON.parse(readFileSync(upstreamPath, 'utf8')).files;
    if (resynced.includes(ownFile)) {
        problems.push(`Resync recorded the fork's own ${ownFile} as taken`);
    }
    if (resynced.length !== files.length - 1) {
        problems.push(
            `Resync recorded ${resynced.length} files, not the ${files.length - 1} taken`
        );
    }
    writeFileSync(upstreamPath, recorded);
    if (problems.length > 0) {
        throw new Error(problems.join('\n'));
    }
    console.log(`Applied ${files.length} files to ${to}`);

    appendFileSync(
        path.join(to, 'pnpm-workspace.yaml'),
        `\nminimumReleaseAgeExclude:\n${publishedNames()
            .toSorted((a, b) => a.localeCompare(b, 'en'))
            .map(name => `  - '${name}'`)
            .join('\n')}\n`
    );

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

// Proves the getting-started page by running it: each `sh` block of `docs/src/framework/getting-started.md`, in order, in
// one shell in a temporary directory, as a new user would, with the published packages. Then the step the page gives in
// prose (declaring `sync-injected` on a dependency) and a final `verify`. It takes minutes and resolves from the
// registry, so it is never part of `verify`: Nx's `starter-audit` target and a weekly workflow run it.
//
//   node audit-starter.mjs [--local] [--keep]
//
// `--local` installs this repository's builds of the published packages instead (build them first), for a change to
// them before it is released.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

const repositoryRoot = path.join(import.meta.dirname, '../../..');
const page = path.join(repositoryRoot, 'docs/src/framework/getting-started.md');
// What the page installs from npm, by where this repository builds it
const publishedPackages = {
    '@leyman/check-package': 'apps/check-package',
    '@leyman/configs': 'leyman/configs',
    '@leyman/eslint-config': 'leyman/eslint-config',
    '@leyman/expect': 'leyman/expect',
    '@leyman/nx-plugin': 'leyman/nx-plugin',
    'nx-lifecycle': 'apps/nx-lifecycle',
};
const millisecondsPerSecond = 1000;

const { values } = parseArgs({
    options: {
        keep: { default: false, type: 'boolean' },
        local: { default: false, type: 'boolean' },
    },
});
const tempRoot = realpathSync(tmpdir());
const to = mkdtempSync(path.join(tempRoot, 'starter-audit-'));

// The page's commands, as a user runs them: not in CI, outside any Nx run, and with none of this repository's tools
const outerEnv = Object.entries(process.env).filter(
    ([key]) => !key.startsWith('NX_') && key !== 'CI'
);
const env = {
    ...Object.fromEntries(outerEnv),
    NX_DAEMON: 'false',
    NX_NO_CLOUD: 'true',
    PATH: process.env.PATH.split(path.delimiter)
        .filter(entry => !entry.includes('node_modules'))
        .join(path.delimiter),
};

const run = (label, command, args, cwd) => {
    const start = performance.now();
    console.log(`\n=== ${label}`);

    const { error, status } = spawnSync(command, args, { env, cwd, stdio: 'inherit' });
    if (error !== undefined || status !== 0) {
        throw new Error(`${label} failed in ${cwd}`, { cause: error });
    }
    console.log(
        `=== ${label}: ${Math.round((performance.now() - start) / millisecondsPerSecond)}s`
    );
};

/**
 * Packs this repository's build of each published package, and has pnpm install those instead, through a global
 * pnpmfile, so the page's commands run unchanged.
 *
 * @throws {Error} when a package fails to pack
 */
const installLocalBuilds = () => {
    const tarballs = path.join(to, 'tarballs');
    mkdirSync(tarballs);
    const specifiers = {};
    for (const [name, directory] of Object.entries(publishedPackages)) {
        const { stderr, stdout, status } = spawnSync(
            // eslint-disable-next-line sonarjs/no-os-command-from-path -- the checkout's own pnpm, in a script run by hand
            'pnpm',
            ['pack', '--pack-destination', tarballs, '--json'],
            { cwd: path.join(repositoryRoot, directory), encoding: 'utf8' }
        );
        if (status !== 0) {
            throw new Error(`Packing ${name} failed:\n${stderr}`);
        }
        specifiers[name] = `file:${JSON.parse(stdout).filename}`;
    }
    const pnpmfile = path.join(to, 'local.pnpmfile.cjs');
    writeFileSync(
        pnpmfile,
        `const specifiers = ${JSON.stringify(specifiers)};
module.exports = {
    hooks: {
        readPackage(manifest) {
            for (const field of ['dependencies', 'devDependencies']) {
                for (const [name, specifier] of Object.entries(specifiers)) {
                    if (manifest[field]?.[name] !== undefined) {
                        manifest[field][name] = specifier;
                    }
                }
            }
            return manifest;
        },
    },
};
`
    );
    env.pnpm_config_global_pnpmfile = pnpmfile;
};

try {
    if (values.local) {
        installLocalBuilds();
    }

    const blocks = readFileSync(page, 'utf8')
        .matchAll(/^```sh\n(?<code>.*?)^```$/gmsv)
        .map(({ groups }) => groups.code)
        .toArray();
    if (blocks.length === 0) {
        throw new Error(`No sh blocks in ${page}`);
    }
    run('Getting started', 'bash', ['-euo', 'pipefail', '-c', blocks.join('\n')], to);

    const workspace = path.join(to, 'my-workspace');
    // The page says, in prose, to declare `sync-injected` on the package another depends on
    const projectJson = path.join(workspace, 'packages/my-lib/project.json');
    const project = JSON.parse(readFileSync(projectJson, 'utf8'));
    project.targets['sync-injected'] = {};
    writeFileSync(projectJson, `${JSON.stringify(project, null, 2)}\n`);

    run('Sync', 'pnpm', ['nx', 'sync'], workspace);
    run('Verify', 'pnpm', ['nx', 'run-many', '-t', 'verify', '--outputStyle', 'static'], workspace);
} finally {
    if (values.keep) {
        console.log(`\nKept ${to}`);
    } else {
        rmSync(to, { force: true, recursive: true });
    }
}

// Runs the test suites of each published package whose floor (the major of `engines.node`) the Node.js binary at
// `NODE_22` meets, with that binary: the same suites as its `mocha-unit-test`, `mocha-integration-test` and
// `vitest-unit-test` targets, from its compiled `dist-test`, without coverage. Every package runs, and it fails at the
// end naming the packages that failed.
//
// Only the test runners run on that Node.js: this script, Nx and pnpm stay on the toolchain's.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const node = process.env.NODE_22;
if (!node) {
    throw new Error('Set NODE_22 to a Node.js 22 binary');
}
const floorMajor = Number(
    execFileSync(node, ['-p', 'process.versions.node.split(".")[0]'], { encoding: 'utf8' })
);

// Each target's command, as in `nx.json`, without `c8`
const suites = {
    'mocha-unit-test': [
        'node_modules/mocha/bin/mocha.js',
        '--recursive',
        'dist-test/unit/**/*.spec.*js',
    ],
    'mocha-integration-test': [
        'node_modules/mocha/bin/mocha.js',
        '--timeout',
        '10000',
        '--recursive',
        'dist-test/integration/**/*.spec.*js',
    ],
    'vitest-unit-test': [
        'node_modules/vitest/vitest.mjs',
        'run',
        '--config',
        'node_modules/@leyman/configs/vitest.config.js',
        '--root',
        '.',
    ],
};

const readJson = file => JSON.parse(readFileSync(file, 'utf8'));

// Found the same way `Publish` in `dagger/main.go` finds what to publish
// eslint-disable-next-line sonarjs/no-os-command-from-path -- pnpm comes from PATH, as it does for every Nx target
const workspace = execFileSync('pnpm', ['ls', '--recursive', '--depth', '-1', '--json'], {
    encoding: 'utf8',
});
const packages = JSON.parse(workspace)
    .filter(pkg => !pkg.private && pkg.name !== undefined)
    .toSorted((a, b) => a.name.localeCompare(b.name));

const failed = [];
for (const pkg of packages) {
    // `check-package` checks every published package names its floor this way
    const range = readJson(path.join(pkg.path, 'package.json')).engines?.node ?? '';
    const floor = Number(/^>=\s*(?<major>\d+)/v.exec(range)?.groups?.major);
    if (floor > floorMajor) {
        console.log(`Skipping ${pkg.name}: needs Node.js ${floor}`);
        continue;
    }
    const project = readJson(path.join(pkg.path, 'project.json'));
    const targets = new Set(Object.keys(project.targets ?? {}));
    for (const [target, args] of Object.entries(suites)) {
        if (!targets.has(target)) {
            continue;
        }
        console.log(`Running ${pkg.name}:${target} on Node.js ${floorMajor}`);
        const { status } = spawnSync(node, args, {
            cwd: pkg.path,
            env: { ...process.env, NODE_OPTIONS: '--enable-source-maps' },
            stdio: 'inherit',
        });
        if (status !== 0) {
            failed.push(`${pkg.name}:${target}`);
        }
    }
}

if (failed.length > 0) {
    console.error(`Failed on Node.js ${floorMajor}:`);
    for (const name of failed) {
        console.error(`  ${name}`);
    }
    process.exitCode = 1;
}

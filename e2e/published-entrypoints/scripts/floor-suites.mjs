// Runs the test suites of each published package on its exact floor, with that floor's binary (see `floors.mjs`):
// the same suites as its `mocha-unit-test`, `mocha-integration-test` and `vitest-unit-test` targets, from its
// compiled `dist-test`, without coverage. Every package runs, and it fails at the end naming the suites that failed.
//
// Only the test runners run on the floor's Node.js: this script, Nx and pnpm stay on the toolchain's.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { floorBinaries, publishedPackages } from './floors.mjs';

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

const packages = publishedPackages();
// Resolved up front, so a missing floor fails before any suite runs
const binaries = floorBinaries(packages.map(pkg => pkg.floor).filter(floor => floor !== null));

const failed = [];
for (const pkg of packages) {
    const { targets = {} } = JSON.parse(readFileSync(path.join(pkg.path, 'project.json'), 'utf8'));
    const toRun = Object.entries(suites).filter(([target]) => {
        if (!Object.hasOwn(targets, target)) {
            return false;
        }
        // A project that overrides the command (`@leyman/eslint-config` lints itself as its integration test) runs
        // something other than the suite above
        if (targets[target].options?.commands ?? targets[target].options?.command) {
            console.log(`Skipping ${pkg.name}:${target}: it overrides the command in nx.json`);
            return false;
        }
        return true;
    });
    for (const [target, args] of toRun) {
        if (pkg.floor === null) {
            throw new Error(`${pkg.name} has ${target} but no engines.node floor to run it on`);
        }
        console.log(`Running ${pkg.name}:${target} on Node.js ${pkg.floor}`);
        const { status } = spawnSync(binaries.get(pkg.floor), args, {
            cwd: pkg.path,
            env: { ...process.env, NODE_OPTIONS: '--enable-source-maps' },
            stdio: 'inherit',
        });
        if (status !== 0) {
            failed.push(`${pkg.name}:${target} on Node.js ${pkg.floor}`);
        }
    }
}

if (failed.length > 0) {
    console.error('Failed:');
    for (const name of failed) {
        console.error(`  ${name}`);
    }
    process.exitCode = 1;
}

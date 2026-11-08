// Imports each published package's entry points on its exact floor: for each floor, runs the entrypoints spec once
// with that floor's binary, testing only the packages whose floor it is (passed in `FLOOR_TEST_PACKAGES`).
//
// Only mocha runs on the floor's Node.js: this script, Nx and pnpm stay on the toolchain's.

import { spawnSync } from 'node:child_process';
import { floorBinaries, publishedPackages } from './floors.mjs';

const byFloor = Map.groupBy(
    publishedPackages().filter(pkg => {
        if (pkg.floor === null) {
            console.log(`Skipping ${pkg.name}: no engines.node, so nothing to import`);
        }
        return pkg.floor !== null;
    }),
    pkg => pkg.floor
);
const binaries = floorBinaries(byFloor.keys());

const failed = [];
const floors = byFloor
    .keys()
    .toArray()
    .toSorted((a, b) => a.localeCompare(b, 'en', { numeric: true }));
for (const floor of floors) {
    const packages = byFloor.get(floor) ?? [];
    console.log(`Importing ${packages.length} packages on Node.js ${floor}`);
    const { status } = spawnSync(
        binaries.get(floor),
        [
            'node_modules/mocha/bin/mocha.js',
            '--timeout',
            '10000',
            'dist-test/integration/entrypoints.spec.js',
        ],
        {
            env: {
                ...process.env,
                FLOOR_TEST_PACKAGES: packages.map(pkg => pkg.name).join(','),
            },
            stdio: 'inherit',
        }
    );
    if (status !== 0) {
        failed.push(floor);
    }
}

if (failed.length > 0) {
    console.error(`Failed on Node.js ${failed.join(', ')}`);
    process.exitCode = 1;
}

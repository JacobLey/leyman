// What `floor-test` and `floor-suites` share: the published packages with their support floor, and the Node.js binary
// to test each floor with.
//
// A floor is the exact oldest version `engines.node` allows, so `>=24` is 24.0.0 and `>=22.12` is 22.12.0. Its binary
// is `$NODE_FLOORS/<version>/bin/node`: Dagger puts one there for each floor (`nodeFloorImages` in `dagger/main.go`),
// and a floor without one fails rather than being skipped or tested on another version.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const readJson = file => JSON.parse(readFileSync(file, 'utf8'));

/**
 * The exact oldest version an `engines.node` range allows.
 * `check-package` checks every published package names its floor as `>=<version>`.
 *
 * @param name - the package, for the error
 * @param range - its `engines.node`
 * @returns the version, e.g. `22.12.0`
 * @throws {Error} when the range isn't `>=<version>`
 */
const floorOf = (name, range) => {
    const match = /^>=\s*(?<major>\d+)(?:\.(?<minor>\d+)(?:\.(?<patch>\d+))?)?$/v.exec(range);
    if (!match?.groups) {
        throw new Error(`${name}: engines.node "${range}" is not ">=<version>"`);
    }
    const { major, minor = '0', patch = '0' } = match.groups;
    return `${major}.${minor}.${patch}`;
};

/**
 * Every published package, sorted by name. Found the same way `Publish` in `dagger/main.go` finds what to publish.
 * A package without `engines.node` (only config files, so nothing to run) has a `floor` of `null`.
 *
 * @returns each package's name, directory (`path`) and `floor`
 */
export const publishedPackages = () => {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- pnpm comes from PATH, as it does for every Nx target
    const workspace = execFileSync('pnpm', ['ls', '--recursive', '--depth', '-1', '--json'], {
        encoding: 'utf8',
    });
    return JSON.parse(workspace)
        .filter(pkg => !pkg.private && pkg.name !== undefined)
        .map(pkg => {
            const range = readJson(path.join(pkg.path, 'package.json')).engines?.node;
            return {
                name: pkg.name,
                path: pkg.path,
                floor: range === undefined ? null : floorOf(pkg.name, range),
            };
        })
        .toSorted((a, b) => a.name.localeCompare(b.name));
};

/**
 * The Node.js binary for each floor, under `NODE_FLOORS`, checked to be that exact version.
 *
 * @param floors - the floors to test
 * @returns each floor's binary, by floor
 * @throws {Error} naming every floor without a binary of its version
 */
export const floorBinaries = floors => {
    const directory = process.env.NODE_FLOORS;
    if (!directory) {
        throw new Error(
            'Set NODE_FLOORS to a directory with a Node.js binary at <version>/bin/node for each floor'
        );
    }
    const binaries = new Map();
    const missing = [];
    const unique = new Set(floors);
    for (const floor of unique) {
        const binary = path.join(directory, floor, 'bin', 'node');
        let version;
        try {
            version = execFileSync(binary, ['-p', 'process.versions.node'], {
                encoding: 'utf8',
            }).trim();
        } catch {
            version = null;
        }
        if (version === floor) {
            binaries.set(floor, binary);
        } else {
            missing.push(`${floor} (${binary}: ${version ?? 'not runnable'})`);
        }
    }
    if (missing.length > 0) {
        throw new Error(
            `No Node.js binary for these floors, add them to nodeFloorImages in dagger/main.go:\n  ${missing.join('\n  ')}`
        );
    }
    return binaries;
};

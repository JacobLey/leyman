// Checks a released Go module (one with a VERSION file), run from its directory:
// - VERSION is a plain `X.Y.Z`, and the first `## ` heading of CHANGELOG.md names it.
// - Its major version fits the module path (v0 and v1 have no `/vN` suffix).
// - Every workspace module it requires (a `replace` to a local directory, holding the module it replaces) is released,
//   at the version its VERSION names. Consumers ignore `replace` and fetch the required version, so it must be the one
//   tested here.
//
// CI tags `<directory>/v<VERSION>` for each released module once it reaches main, see the dagger-ci skill.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const errors = [];

/**
 * The version a module's VERSION file names, as written.
 *
 * @param directory - a module's directory
 * @returns the file's content, or undefined when it has none
 */
const readVersion = directory => {
    const file = path.join(directory, 'VERSION');
    return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
};

/**
 * A go.mod, as `go mod edit -json` reads it.
 *
 * @param file - path of the go.mod file to read
 * @returns its fields
 */
const readGoMod = file =>
    JSON.parse(
        // eslint-disable-next-line sonarjs/no-os-command-from-path -- the toolchain's own Go, in a script run by Nx
        execFileSync('go', ['mod', 'edit', '-json', file], { encoding: 'utf8' })
    );

/**
 * Checks the module's go.mod against its version, and its workspace dependencies' VERSION files.
 *
 * @param released - the module's version
 */
const checkGoMod = released => {
    const goMod = readGoMod('go.mod');

    const [major] = released.split('.', 1);
    const suffix = /\/v(?<major>\d+)$/v.exec(goMod.Module.Path)?.groups?.major ?? '1';
    if (Number(suffix) !== Math.max(Number(major), 1)) {
        errors.push(`version ${released} doesn't fit module path ${goMod.Module.Path}`);
    }

    const required = new Map((goMod.Require ?? []).map(({ Path, Version }) => [Path, Version]));
    const replaced = goMod.Replace ?? [];
    for (const { Old, New } of replaced) {
        if (New.Version !== undefined) {
            errors.push(`${Old.Path} is replaced with a module, which consumers would not see`);
            continue;
        }
        const local = readGoMod(path.join(New.Path, 'go.mod')).Module.Path;
        const dependency = readVersion(New.Path)?.trim();
        const requiredVersion = required.get(Old.Path);
        if (local !== Old.Path) {
            errors.push(`${Old.Path} is replaced with ${New.Path}, which holds ${local}`);
        } else if (dependency === undefined) {
            errors.push(`${Old.Path} (${New.Path}) is not released, so consumers can't fetch it`);
        } else if (requiredVersion !== `v${dependency}`) {
            errors.push(
                `${Old.Path} must be required at v${dependency} (its VERSION), got ${requiredVersion ?? 'not required'}`
            );
        }
    }
};

const version = readVersion('.');
if (version === undefined) {
    errors.push('VERSION is missing');
} else if (/^\d+\.\d+\.\d+\n$/v.test(version)) {
    const released = version.trim();
    const changelog = existsSync('CHANGELOG.md') ? readFileSync('CHANGELOG.md', 'utf8') : '';
    const heading = /^## (?<heading>.*)$/mv.exec(changelog)?.groups?.heading;
    if (heading !== released) {
        errors.push(
            `CHANGELOG.md's first "## " heading must be ${released}, got ${heading ?? 'none'}`
        );
    }
    checkGoMod(released);
} else {
    errors.push(`VERSION must be one line "X.Y.Z", got ${JSON.stringify(version)}`);
}

for (const error of errors) {
    console.error(error);
}
if (errors.length > 0) {
    process.exitCode = 1;
}

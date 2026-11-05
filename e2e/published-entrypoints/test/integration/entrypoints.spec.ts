import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';

interface WorkspacePackage {
    name?: string;
    path: string;
    private: boolean;
}

interface PackageJson {
    devDependencies?: Record<string, string>;
    engines?: { node?: string };
    exports?: unknown;
}

// Tests are defined synchronously, so everything they need is read up front.

// Found the same way `Publish` in `dagger/main.go` finds what to publish.
// pnpm comes from PATH, as it does for every Nx target.
// eslint-disable-next-line sonarjs/no-os-command-from-path -- pnpm comes from PATH, as it does for every Nx target
const workspace = execFileSync('pnpm', ['ls', '--recursive', '--depth', '-1', '--json'], {
    encoding: 'utf8',
});
const published = (JSON.parse(workspace) as WorkspacePackage[])
    .filter(pkg => !pkg.private && pkg.name !== undefined)
    .map(pkg => ({
        name: pkg.name!,
        packageJsonPath: path.join(pkg.path, 'package.json'),
    }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
// The `floor-test` target runs this on the oldest Node.js a package may support, where a package that needs newer
// is skipped
const runningMajor = Number(process.versions.node.split('.', 1)[0]);
const publishedPackages = new Map<string, { exports: unknown; floor: number }>();
for (const { name, packageJsonPath } of published) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageJson;
    publishedPackages.set(name, {
        exports: packageJson.exports,
        // `check-package` checks every published package names its floor this way
        floor: Number(/^>=\s*(?<major>\d+)/v.exec(packageJson.engines?.node ?? '')?.groups?.major),
    });
}

// Compiled to `dist-test/integration/`
const ownPackageJson = JSON.parse(
    readFileSync(path.join(import.meta.dirname, '../../package.json'), 'utf8')
) as PackageJson;
const installed = Object.keys(ownPackageJson.devDependencies ?? {});

/**
 * Subpaths of `exports`, e.g. `.` and `./package.json`.
 * `exports` can also be a single path, or the conditions for `.` alone.
 *
 * @param exports - `exports` field of a package.json
 * @returns each subpath the package can be imported by
 */
const subpaths = (exports: unknown): string[] => {
    if (
        exports !== null &&
        typeof exports === 'object' &&
        Object.keys(exports).some(key => key.startsWith('.'))
    ) {
        return Object.keys(exports);
    }
    return ['.'];
};

suite('Published entry points', () => {
    test('Every published package is installed here', () => {
        expect(
            published.map(pkg => pkg.name).filter(name => !installed.includes(name))
        ).to.deep.equal([]);
    });

    for (const [name, { exports, floor }] of publishedPackages) {
        suite(name, () => {
            for (const subpath of subpaths(exports)) {
                const specifier = `${name}${subpath.slice(1)}`;

                (floor > runningMajor ? test.skip : test)(`Imports ${specifier}`, async () => {
                    // A pattern (`./*`) would need a file to import for each match
                    expect(subpath).to.not.include('*', 'Subpath patterns are not supported');

                    if (subpath.endsWith('.json')) {
                        const { default: json } = (await import(specifier, {
                            with: { type: 'json' },
                        })) as { default: unknown };
                        expect(json).to.be.an('object');
                    } else {
                        const module = (await import(specifier)) as object;
                        expect(Object.keys(module)).to.not.have.lengthOf(0);
                    }
                });
            }
        });
    }
});

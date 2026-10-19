import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';

const execFileAsync = promisify(execFile);

interface PackageJson {
    dependencies?: Record<string, string>;
    exports?: string | Record<string, string>;
    peerDependencies?: Record<string, string>;
    peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

// Compiled to `dist-test/integration/`
const packageRoot = path.join(import.meta.dirname, '../..');
const ownPackageJson = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
    devDependencies: Record<string, string>;
};

// Tests are defined synchronously, so everything they need is read up front.
const readPackageJson = (name: string): PackageJson =>
    JSON.parse(
        // eslint-disable-next-line n/no-sync -- runs while defining tests, which is synchronous
        readFileSync(path.join(packageRoot, 'node_modules', name, 'package.json'), 'utf8')
    ) as PackageJson;

const withEslintEntry = Object.keys(ownPackageJson.devDependencies)
    .map(name => ({ name, packageJson: readPackageJson(name) }))
    .filter(
        ({ packageJson }) =>
            typeof packageJson.exports === 'object' && './eslint' in packageJson.exports
    );

/**
 * Every module URL Node resolves while importing `specifier`, in a fresh process.
 *
 * @param specifier - module to import
 * @returns resolved URLs, including the entry point
 */
const loadedModules = async (specifier: string): Promise<string[]> => {
    const script = `
        import { registerHooks } from 'node:module';
        const loaded = [];
        registerHooks({
            resolve: (specifier, context, next) => {
                const result = next(specifier, context);
                loaded.push(result.url);
                return result;
            },
        });
        await import(process.argv[1]);
        console.log(JSON.stringify(loaded));
    `;
    const { stdout } = await execFileAsync(
        process.execPath,
        ['--input-type=module', '--eval', script, specifier],
        { cwd: packageRoot }
    );
    return JSON.parse(stdout) as string[];
};

const isEslint = (url: string): boolean => url.includes('/node_modules/eslint/');

suite('ESLint plugin entry points', () => {
    test('At least one package ships a plugin', () => {
        expect(withEslintEntry).to.not.have.lengthOf(0);
    });

    for (const { name, packageJson } of withEslintEntry) {
        suite(name, () => {
            test('Main entry point does not load the plugin or eslint', async () => {
                const pluginDir = path.dirname(import.meta.resolve(`${name}/eslint`));
                const loaded = await loadedModules(name);
                expect(
                    loaded.filter(url => url.startsWith(`${pluginDir}/`) || isEslint(url))
                ).to.deep.equal([]);
            });

            test('Plugin does not load eslint at runtime', async () => {
                const loaded = await loadedModules(`${name}/eslint`);
                expect(loaded.filter(url => isEslint(url))).to.deep.equal([]);
            });

            test('eslint is only an optional peer dependency', () => {
                expect(packageJson.dependencies ?? {}).to.not.have.property('eslint');
                expect(packageJson.peerDependencies).to.have.property('eslint');
                expect(packageJson.peerDependenciesMeta).to.have.nested.property(
                    'eslint.optional',
                    true
                );
            });
        });
    }
});

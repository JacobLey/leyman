import type { GeneratorCallback, Tree } from '@nx/devkit';
import type { NxPluginOptions } from '#internal/lib/options.js';
import Path from 'node:path';
import {
    getProjects,
    installPackagesTask,
    joinPathFragments,
    normalizePath,
    readJson,
    readNxJson,
    writeJson,
} from '@nx/devkit';
import { inferencePaths, inferTargets } from '#internal/lib/infer.js';
import { resolveOptions } from '#internal/lib/options.js';
import { name as pluginName } from '#internal/lib/plugin.js';
import { assertOptions, defaultFloor } from '#internal/lib/schema.js';
import { readWorkspaceVersions, resolveVersion } from '#internal/lib/versions.js';

/**
 * What the `package` generator adds, and where.
 */
export interface PackageGeneratorOptions {
    /**
     * Where the package goes, relative to the workspace root, e.g. `packages/my-lib`.
     */
    readonly directory: string;
    /**
     * A placeholder export, for the first test to import until the package has an API.
     *
     * @default the directory's last segment
     */
    readonly name?: string;
    /**
     * Description, for `package.json` and the README.
     */
    readonly description: string;
    /**
     * Published to npm, rather than private.
     *
     * @default false
     */
    readonly published?: boolean;
    /**
     * The oldest Node.js a published package supports, as `<major>.<minor>.<patch>`. Its major picks the
     * `node-<major>` catalog for `@types/node` and the support floor's tsconfig.
     *
     * @default '22.12.0'
     */
    readonly floor?: string;
    /**
     * Test runner, or `none` for no tests.
     *
     * @default 'mocha'
     */
    readonly test?: 'mocha' | 'none' | 'vitest';
    /**
     * URL of the workspace's GitHub repository, for a published package's `repository`, `homepage` and `bugs`.
     */
    readonly repository?: string;
    /**
     * `author` of `package.json`.
     */
    readonly author?: string;
    /**
     * `license` of `package.json`. A published package also gets a copy of the workspace's `LICENSE`.
     */
    readonly license?: string;
    /**
     * More packages to add to `devDependencies`.
     */
    readonly devDependencies?: readonly string[];
    /**
     * File of the plugin options, relative to the workspace root, for a workspace running the `targets` executor.
     *
     * @default the options of the plugin in `nx.json`
     */
    readonly config?: string;
    /**
     * Don't install dependencies afterwards.
     *
     * @default false
     */
    readonly skipInstall?: boolean;
}

interface ProjectJson {
    readonly $schema?: string;
}

/**
 * The plugin options: from `config`, or else from the plugin's entry in `nx.json`.
 *
 * @param tree - the workspace
 * @param config - file of the options, if any
 * @returns the options, validated
 * @throws {Error} when they are invalid
 */
const readPluginOptions = (tree: Tree, config: string | undefined): NxPluginOptions => {
    if (config !== undefined) {
        const options: unknown = readJson(tree, config);
        assertOptions(options, config);
        return options;
    }
    const plugin = readNxJson(tree)?.plugins?.find(
        entry => (typeof entry === 'string' ? entry : entry.plugin) === pluginName
    );
    const options: unknown = typeof plugin === 'object' ? (plugin.options ?? {}) : {};
    assertOptions(options, 'nx.json');
    return options;
};

/**
 * The `$schema` of a new `project.json`: the one other projects name, else Nx's in the root `node_modules`.
 *
 * @param tree - the workspace
 * @param directory - the new project's directory
 * @returns its path relative to the directory, if one is found
 */
const projectSchema = (tree: Tree, directory: string): string | undefined => {
    let schema: string | undefined;
    for (const { root } of getProjects(tree).values()) {
        const path = joinPathFragments(root, 'project.json');
        const $schema = tree.exists(path) ? readJson<ProjectJson>(tree, path).$schema : undefined;
        if ($schema !== undefined && !/^[a-z]+:/v.test($schema)) {
            schema = joinPathFragments(root, $schema);
            break;
        }
    }
    if (schema === undefined && tree.exists('node_modules/nx/package.json')) {
        schema = 'node_modules/nx/schemas/project-schema.json';
    }
    return schema === undefined ? undefined : Path.posix.relative(directory, schema);
};

/**
 * `repository`, `homepage` and `bugs` of a package in a GitHub repository.
 *
 * @param url - URL of the repository, with or without `git+` and `.git`
 * @param directory - the package's directory in it
 * @returns the fields of `package.json`
 */
const repositoryFields = (url: string, directory: string): Record<string, unknown> => {
    const base = url.replace(/^git\+/v, '').replace(/\.git$/v, '');
    return {
        repository: { type: 'git', url: `git+${base}.git`, directory },
        homepage: `${base}/tree/main/${directory}#readme`,
        bugs: { url: `${base}/issues` },
    };
};

const sourceFile = (name: string): string => `/**
 * A placeholder export, for the first test to import until the package has an API.
 */
export const packageName = '${name}';
`;

const mochaSpec = (name: string): string => `import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { packageName } from '${name}';

suite('${name}', () => {
    test('Exports its name', () => {
        expect(packageName).to.equal('${name}');
    });
});
`;

const vitestSpec = (name: string): string => `import { expect, suite, test } from 'vitest';
import { packageName } from '${name}';

suite('${name}', () => {
    test('Exports its name', () => {
        expect(packageName).toBe('${name}');
    });
});
`;

const eslintConfig = `import configGenerator from '@leyman/eslint-config';
import packageJson from './package.json' with { type: 'json' };

export default configGenerator({ configUrl: import.meta.url, node: true, packageJson });
`;

const testDependencies = {
    mocha: ['@leyman/expect', '@types/mocha', 'c8', 'mocha', 'mocha-chain'],
    vitest: ['c8', 'vitest'],
    none: [],
} as const;

/**
 * Nx generator adding a TypeScript ESM package: its `package.json`, configs, a first source file and test, and a
 * `project.json` declaring the targets the plugin infers from them.
 *
 * @param tree - the workspace
 * @param options - what to add
 * @returns the task installing dependencies, unless `skipInstall`
 * @rejects {Error} when the directory already holds a package, the plugin options are invalid, or a dependency has
 * no version in the workspace
 */
const packageGenerator = async (
    tree: Tree,
    options: PackageGeneratorOptions
): Promise<GeneratorCallback | undefined> => {
    const normalized = Path.posix.normalize(normalizePath(options.directory));
    const directory = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
    if (
        ['package.json', 'project.json'].some(file =>
            tree.exists(joinPathFragments(directory, file))
        )
    ) {
        throw new Error(`${directory} already holds a project`);
    }
    const name = options.name ?? Path.posix.basename(directory);
    const { published = false, floor = defaultFloor, test = 'mocha' } = options;
    const resolved = resolveOptions(readPluginOptions(tree, options.config));
    const versions = await readWorkspaceVersions(tree);

    const devDependencies = [
        ...new Set([
            '@biomejs/biome',
            '@leyman/configs',
            '@leyman/eslint-config',
            '@swc/cli',
            '@swc/core',
            '@types/node',
            'eslint',
            'typescript',
            ...testDependencies[test],
            ...(options.devDependencies ?? []),
        ]),
    ].toSorted((a, b) => a.localeCompare(b));
    // A published package's types are of its support floor's major
    // The schema checks it is `<major>.<minor>.<patch>`
    const floorMajor = floor.slice(0, floor.indexOf('.'));
    const floorCatalog = `node-${floorMajor}`;
    const floorTypes =
        versions.catalogs[floorCatalog]?.['@types/node'] === undefined
            ? `^${floorMajor}.0.0`
            : `catalog:${floorCatalog}`;
    const packageJson = {
        name,
        version: '0.0.1',
        description: options.description,
        ...(published ? { engines: { node: `>=${floor}` } } : { private: true }),
        type: 'module',
        ...(options.author !== undefined && { author: options.author }),
        ...(options.license !== undefined && { license: options.license }),
        ...(published &&
            options.repository !== undefined &&
            repositoryFields(options.repository, directory)),
        sideEffects: false,
        types: './dist/index.js',
        files: ['dist', '!dist/**/*.map', '!dist/tsconfig.tsbuildinfo'],
        exports: { '.': './dist/index.js' },
        devDependencies: Object.fromEntries(
            devDependencies.map(dependency => [
                dependency,
                published && dependency === '@types/node'
                    ? floorTypes
                    : resolveVersion(dependency, versions),
            ])
        ),
    };

    const { floorTsconfig } = resolved.checkPackage;
    writeJson(tree, joinPathFragments(directory, 'package.json'), packageJson);
    writeJson(tree, joinPathFragments(directory, 'tsconfig.json'), {
        extends:
            published && floorTsconfig !== false
                ? floorTsconfig.replaceAll('{major}', () => floorMajor)
                : '@leyman/configs/tsconfig.build.json',
        compilerOptions: {
            outDir: 'dist',
            rootDir: 'src',
            tsBuildInfoFile: 'dist/tsconfig.tsbuildinfo',
        },
        include: ['src'],
    });
    tree.write(joinPathFragments(directory, 'src/index.ts'), sourceFile(name));
    if (test !== 'none') {
        writeJson(tree, joinPathFragments(directory, 'test/tsconfig.json'), {
            extends: '@leyman/configs/tsconfig.test.json',
            references: [{ path: '..' }],
        });
        tree.write(
            joinPathFragments(directory, 'test/unit/index.spec.ts'),
            test === 'mocha' ? mochaSpec(name) : vitestSpec(name)
        );
    }
    tree.write(joinPathFragments(directory, 'eslint.config.js'), eslintConfig);
    tree.write(joinPathFragments(directory, 'README.md'), `# ${name}\n\n${options.description}\n`);
    const license = tree.read('LICENSE');
    if (published && license !== null) {
        tree.write(joinPathFragments(directory, 'LICENSE'), license);
    }

    const present = new Set(
        inferencePaths.filter(path => tree.exists(joinPathFragments(directory, path)))
    );
    const inferred = inferTargets(
        { packageJson, root: directory, isDependency: false, has: path => present.has(path) },
        resolved
    );
    const targets = Object.fromEntries(
        inferred.map(target => [(resolved.targets[target] as { name: string }).name, {}])
    );
    const $schema = projectSchema(tree, directory);
    writeJson(tree, joinPathFragments(directory, 'project.json'), {
        ...($schema !== undefined && { $schema }),
        name,
        targets,
    });

    return options.skipInstall === true
        ? undefined
        : // Installs even though the workspace's own package.json is unchanged
          installPackagesTask.bind(undefined, tree, true);
};
export default packageGenerator;

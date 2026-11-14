import type { Linter } from 'eslint';
import type { Suite } from 'mocha';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import Path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect } from 'chai';
import { ESLint } from 'eslint';
import { after, before, suite, test } from 'mocha';
import configGenerator, { nonDeprecatedRules } from '#internal/eslint-config.js';
import { importPlugin } from '#internal/lib/plugins.js';

const globalsOf = async (options: { node?: boolean }) => {
    const config = await configGenerator({
        configUrl: import.meta.url,
        packageJson: { name: 'fake', version: '1.0.0' },
        ...options,
    });
    const [source, tests] = config
        .map(block => block.languageOptions?.globals)
        .filter(globals => globals !== undefined);
    return { source, tests };
};

suite('configGenerator globals', function (this: Suite) {
    // The first config built collects every plugin's rules, which on a loaded CI runner under c8 outlasts a test's timeout
    this.timeout(10_000);
    before(async () => {
        await globalsOf({});
    });

    test('Only defines globals shared with browsers by default', async () => {
        const { source } = await globalsOf({});
        expect(source).to.include.keys('console', 'fetch', 'setTimeout', 'URL');
        expect(source).to.not.have.any.keys('Buffer', 'process', 'setImmediate');
    });

    test('Defines Node.js globals for a Node.js package', async () => {
        const { source } = await globalsOf({ node: true });
        expect(source).to.include.keys('Buffer', 'fetch', 'process');
    });

    test('Always defines Node.js globals in tests', async () => {
        const { tests } = await globalsOf({});
        expect(tests).to.include.keys('Buffer', 'process', 'setImmediate');
    });
});

const configOf = async (packageJson: object) =>
    configGenerator({
        configUrl: import.meta.url,
        packageJson: { name: 'fake', version: '1.0.0', ...packageJson },
    });

const reactVersionOf = async (packageJson: object) => {
    const config = await configOf(packageJson);
    return config
        .map(block => (block.settings?.react as { version?: string } | undefined)?.version)
        .find(version => version !== undefined);
};

const reactPluginsOf = async (packageJson: object) => {
    const config = await configOf(packageJson);
    return config.flatMap(block =>
        Object.keys(block.plugins ?? {}).filter(name =>
            ['jsx-a11y', 'react', 'react-hooks'].includes(name)
        )
    );
};

suite('configGenerator React', () => {
    test('Detects the installed React when the package depends on it', async () => {
        expect(await reactVersionOf({ peerDependencies: { react: '^19' } })).to.equal('detect');
    });

    test('Detects the installed React when only tests depend on it', async () => {
        expect(await reactVersionOf({ devDependencies: { react: '^19' } })).to.equal('detect');
    });

    test('Skips detection without React', async () => {
        expect(await reactVersionOf({ dependencies: { chai: '^6' } })).to.equal('999.999.999');
    });

    test('Adds the React plugins when the package depends on React', async () => {
        expect(await reactPluginsOf({ dependencies: { react: '^19' } })).to.have.members([
            'jsx-a11y',
            'react',
            'react-hooks',
        ]);
    });

    test('Leaves out the React plugins without React', async () => {
        expect(await reactPluginsOf({ dependencies: { chai: '^6' } })).to.deep.equal([]);
    });
});

suite('nonDeprecatedRules', () => {
    const rule = { create: () => ({}) };

    test('Turns on each rule, except deprecated, and non-JavaScript ones', () => {
        expect(
            nonDeprecatedRules('plugin', {
                rules: {
                    kept: rule,
                    deprecated: { ...rule, meta: { deprecated: true } },
                    css: { ...rule, meta: { languages: ['css/css'] } },
                },
            })
        ).to.deep.equal({ 'plugin/kept': 'error' });
    });
});

suite('configGenerator import resolution', () => {
    test('Resolves TypeScript sources imported by their JavaScript name', async () => {
        const directory = await mkdtemp(Path.join(tmpdir(), 'eslint-config-'));
        await Promise.all([
            writeFile(
                Path.join(directory, 'a.ts'),
                "import { b } from './b.js';\nexport const a = b;\n"
            ),
            writeFile(
                Path.join(directory, 'b.ts'),
                "import { a } from './a.js';\nexport const b = () => a;\n"
            ),
        ]);
        const config = await configOf({});
        // The generated config's own parser and settings, with only the rule that needs resolving
        const { parser } = config.find(block => block.languageOptions?.parser !== undefined)
            ?.languageOptions as { parser: Linter.Parser };
        const eslint = new ESLint({
            cwd: directory,
            overrideConfigFile: true,
            overrideConfig: {
                files: ['**/*.ts'],
                languageOptions: { parser },
                plugins: { 'import-x': importPlugin },
                settings: Object.assign({}, ...config.map(block => block.settings)) as Record<
                    string,
                    unknown
                >,
                rules: { 'import-x/no-cycle': 'error' },
            },
        });
        const results = await eslint.lintFiles(['a.ts']);
        await rm(directory, { recursive: true });
        expect(
            results.flatMap(result => result.messages.map(message => message.ruleId))
        ).to.deep.equal(['import-x/no-cycle']);
    });
});

/**
 * Writes `files` to a new package directory, with the generated config for it.
 *
 * @param files - Contents, by path in the package
 * @param packageJson - Extra `package.json` fields
 * @returns ESLint for the package, and a function removing it
 */
const packageEslint = async (files: Readonly<Record<string, string>>, packageJson: object = {}) => {
    const directory = await mkdtemp(Path.join(tmpdir(), 'eslint-config-'));
    for (const [file, contents] of Object.entries(files)) {
        await mkdir(Path.dirname(Path.join(directory, file)), { recursive: true });
        await writeFile(Path.join(directory, file), contents);
    }
    const config = await configGenerator({
        configUrl: pathToFileURL(Path.join(directory, 'eslint.config.js')).href,
        packageJson: { name: 'fake', version: '1.0.0', ...packageJson },
    });
    const eslint = new ESLint({ cwd: directory, overrideConfigFile: true, overrideConfig: config });
    return {
        // Each rule as ESLint resolves it: `[severity, ...options]`, with the rule's defaults filled in
        rulesFor: async (file: string) =>
            ((await eslint.calculateConfigForFile(file)) as Linter.Config).rules as Record<
                string,
                [number, ...unknown[]]
            >,
        reported: async (file: string) => {
            const [result] = await eslint.lintFiles([file]);
            return result!.messages.map(message => message.ruleId);
        },
        remove: async () => rm(directory, { recursive: true }),
    };
};

suite('configGenerator per file', function (this: Suite) {
    this.timeout(30_000);

    let eslint: Awaited<ReturnType<typeof packageEslint>>;
    before(async () => {
        eslint = await packageEslint(
            {
                'tsconfig.json': JSON.stringify({ include: ['src'] }),
                'src/a.ts': 'export const a = 1;\n',
                'src/b.js':
                    '/**\n * An example function.\n *\n * @returns the number one\n */\nexport const b = () => 1;\n',
                'src/e.tsx': 'export const e = <br />;\n',
                'src/c.cjs':
                    "'use strict';\n\nconst path = require('node:path');\n\nmodule.exports = path.sep;\n",
                'src/d.js':
                    '// biome-ignore lint/suspicious/noDebugger: example\n// biome-ignore-all format: example\nexport const d = 1;\n',
            },
            { dependencies: { react: '^19' } }
        );
    });
    after(async () => {
        await eslint.remove();
    });

    test('Gives core rules the setting of the type-aware rules replacing them in JavaScript', async () => {
        const rules = await eslint.rulesFor('src/b.js');
        expect(rules['@typescript-eslint/require-await']?.[0]).to.equal(0);
        expect(rules['require-await']?.[0]).to.equal(0);
        expect(rules['prefer-destructuring']).to.deep.include.members([
            2,
            { AssignmentExpression: { array: false, object: true } },
        ]);
        expect(rules['consistent-return']?.[0]).to.equal(2);
    });

    test('Keeps the replaced core rules off in TypeScript', async () => {
        const rules = await eslint.rulesFor('src/a.ts');
        expect(rules['prefer-destructuring']?.[0]).to.equal(0);
        expect(rules['consistent-return']?.[0]).to.equal(0);
    });

    test('Turns off types and accessibility in JavaScript', async () => {
        const rules = await eslint.rulesFor('src/b.js');
        expect(rules['@typescript-eslint/explicit-function-return-type']?.[0]).to.equal(0);
        expect(rules['@typescript-eslint/explicit-module-boundary-types']?.[0]).to.equal(0);
        expect(rules['@typescript-eslint/explicit-member-accessibility']?.[0]).to.equal(0);
    });

    test('Lints JavaScript outside the package root and tsconfig.json', async () => {
        expect(await eslint.reported('src/b.js')).to.deep.equal([]);
    });
});

import type { Suite } from 'mocha';
import { expect } from 'chai';
import { before, suite, test } from 'mocha';
import configGenerator, { nonDeprecatedRules } from '#internal/eslint-config.js';

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

    test('Turns on each rule, except deprecated, non-JavaScript and skipped ones', () => {
        expect(
            nonDeprecatedRules(
                'plugin',
                {
                    rules: {
                        kept: rule,
                        deprecated: { ...rule, meta: { deprecated: true } },
                        css: { ...rule, meta: { languages: ['css/css'] } },
                        skipped: rule,
                    },
                },
                ['skipped', 'not-defined']
            )
        ).to.deep.equal({ 'plugin/kept': 'error' });
    });
});

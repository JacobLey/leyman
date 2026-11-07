import type { Context } from 'mocha';
import { expect } from 'chai';
import { before, suite, test } from 'mocha';
import configGenerator, { nonDeprecatedRules } from '#internal/eslint-config.js';

const globalsOf = (options: { node?: boolean }) => {
    const config = configGenerator({
        configUrl: import.meta.url,
        packageJson: { name: 'fake', version: '1.0.0' },
        ...options,
    });
    const [source, tests] = config
        .map(block => block.languageOptions?.globals)
        .filter(globals => globals !== undefined);
    return { source, tests };
};

suite('configGenerator globals', () => {
    // The first config built collects every plugin's rules, which on a loaded CI runner under c8 outlasts a test's timeout
    before(function (this: Context) {
        this.timeout(10_000);
        globalsOf({});
    });

    test('Only defines globals shared with browsers by default', () => {
        const { source } = globalsOf({});
        expect(source).to.include.keys('console', 'fetch', 'setTimeout', 'URL');
        expect(source).to.not.have.any.keys('Buffer', 'process', 'setImmediate');
    });

    test('Defines Node.js globals for a Node.js package', () => {
        expect(globalsOf({ node: true }).source).to.include.keys('Buffer', 'fetch', 'process');
    });

    test('Always defines Node.js globals in tests', () => {
        expect(globalsOf({}).tests).to.include.keys('Buffer', 'process', 'setImmediate');
    });
});

const reactVersionOf = (packageJson: object) =>
    configGenerator({
        configUrl: import.meta.url,
        packageJson: { name: 'fake', version: '1.0.0', ...packageJson },
    })
        .map(block => (block.settings?.react as { version?: string } | undefined)?.version)
        .find(version => version !== undefined);

suite('configGenerator React version', () => {
    test('Detects the installed React when the package depends on it', () => {
        expect(reactVersionOf({ peerDependencies: { react: '^19' } })).to.equal('detect');
    });

    test('Detects the installed React when only tests depend on it', () => {
        expect(reactVersionOf({ devDependencies: { react: '^19' } })).to.equal('detect');
    });

    test('Skips detection without React', () => {
        expect(reactVersionOf({ dependencies: { chai: '^6' } })).to.equal('999.999.999');
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

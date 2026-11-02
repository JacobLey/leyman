import { expect } from 'chai';
import { suite, test } from 'mocha';
import configGenerator from '#internal/eslint-config.js';

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

import { expect } from 'chai';
import { Linter } from 'eslint';
import { suite, test } from 'mocha';
import { packagePluginConfig } from '#internal/lib/package-plugins.js';
import { fakePlugin } from '../../data/eslint/fake-plugin.js';

const lint = (config: Linter.Config): (string | null)[] => {
    const linter = new Linter();
    return linter.verify('const foo = 1;', [config], 'a.js').map(({ ruleId }) => ruleId);
};

suite('packagePluginConfig', () => {
    test('Turns on recommended rules under the namespace', () => {
        expect(lint(packagePluginConfig(fakePlugin, ['**/*.js']))).to.deep.equal(['fake/no-foo']);
    });

    test('Only applies to the given files', () => {
        expect(lint(packagePluginConfig(fakePlugin, ['**/*.ts']))).to.deep.equal([]);
    });

    test('Leaves out ignored files', () => {
        expect(lint(packagePluginConfig(fakePlugin, ['**/*.js'], ['a.js']))).to.deep.equal([]);
    });

    test('Requires a namespace', () => {
        expect(() =>
            packagePluginConfig({ ...fakePlugin, meta: { name: 'fake-plugin' } }, ['**/*.js'])
        ).to.throw(TypeError, 'fake-plugin');
    });

    test('Requires a namespace, without a name', () => {
        expect(() => packagePluginConfig({ rules: {} }, ['**/*.js'])).to.throw(TypeError);
    });

    test('Requires a recommended config', () => {
        expect(() => packagePluginConfig({ ...fakePlugin, configs: {} }, ['**/*.js'])).to.throw(
            TypeError
        );
    });

    test('Rejects an array recommended config', () => {
        expect(() =>
            packagePluginConfig({ ...fakePlugin, configs: { recommended: [] } }, ['**/*.js'])
        ).to.throw(TypeError);
    });

    test('Rejects a legacy recommended config', () => {
        expect(() =>
            packagePluginConfig(
                { ...fakePlugin, configs: { recommended: { extends: [], rules: {} } } },
                ['**/*.js']
            )
        ).to.throw(TypeError);
    });
});

import type { ESLint, Rule } from 'eslint';
import { expect } from 'chai';
import { Linter } from 'eslint';
import { suite, test } from 'mocha';
import { withLegacyRuleContext } from '#internal/lib/legacy-rule-context.js';

interface LegacyContext {
    getCwd: () => string;
    getFilename: () => string;
    getPhysicalFilename: () => string;
    getSourceCode: () => Rule.RuleContext['sourceCode'];
}

const legacyPlugin: ESLint.Plugin = {
    rules: {
        legacy: {
            create: context => {
                const legacy = context as unknown as LegacyContext;
                context.report({
                    loc: { line: 1, column: 0 },
                    message: [
                        legacy.getCwd(),
                        legacy.getFilename(),
                        legacy.getPhysicalFilename(),
                        legacy.getSourceCode().text,
                    ].join('|'),
                });
                return {};
            },
        },
    },
};

const lint = (plugin: ESLint.Plugin): Linter.LintMessage[] =>
    new Linter({ cwd: '/cwd' }).verify(
        'const a = 1;',
        { plugins: { test: plugin }, rules: { 'test/legacy': 'error' } },
        '/cwd/file.js'
    );

suite('withLegacyRuleContext', () => {
    test('ESLint no longer provides the legacy members', () => {
        expect(() => lint(legacyPlugin)).to.throw(TypeError, 'getCwd is not a function');
    });

    test('Restores the legacy members, which read the current properties', () => {
        const [message] = lint(withLegacyRuleContext(legacyPlugin));
        expect(message?.message).to.equal('/cwd|/cwd/file.js|/cwd/file.js|const a = 1;');
    });

    test('Leaves the original plugin unchanged', () => {
        const patched = withLegacyRuleContext(legacyPlugin);
        expect(patched).to.not.equal(legacyPlugin);
        expect(patched.rules!.legacy).to.not.equal(legacyPlugin.rules!.legacy);
        expect(() => lint(legacyPlugin)).to.throw(TypeError);
    });
});

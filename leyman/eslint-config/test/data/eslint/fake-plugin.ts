import type { ESLint, Rule } from 'eslint';

const noFoo: Rule.RuleModule = {
    meta: { messages: { foo: 'No foo' } },
    create: context => ({
        Identifier: node => {
            if (node.name === 'foo') {
                context.report({ node, messageId: 'foo' });
            }
        },
    }),
};

export const fakePlugin = {
    meta: { name: 'fake-plugin', namespace: 'fake' },
    rules: { 'no-foo': noFoo },
    configs: {
        recommended: { rules: { 'fake/no-foo': 'error' } },
    },
} satisfies ESLint.Plugin;

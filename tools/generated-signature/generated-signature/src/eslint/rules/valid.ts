import type { Rule } from 'eslint';
import { verify } from '../../lib/signature.js';

/**
 * Report generated files that were edited outside of their manual sections.
 */
export const valid: Rule.RuleModule = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow editing generated files outside of their manual sections',
            url: 'https://jacobley.github.io/leyman/packages/generated-signature/guides/eslint#generated-signature-valid',
        },
        messages: {
            invalid:
                'Generated file was edited outside of its manual sections. Regenerate it instead.',
            malformed: 'Generated file is malformed: {{ reason }}.',
        },
        schema: [],
    },
    create: context => ({
        Program: () => {
            const { sourceCode } = context;
            const result = verify(sourceCode.text);
            if (result.status === 'invalid') {
                // The token is the natural place to point at, since its hash is what doesn't match.
                const index = Math.max(sourceCode.text.indexOf('@generated-signature'), 0);
                const start = sourceCode.getLocFromIndex(index);
                context.report({ loc: { start, end: start }, messageId: 'invalid' });
            } else if (result.status === 'malformed') {
                context.report({
                    loc: { line: result.error.line, column: 0 },
                    messageId: 'malformed',
                    data: { reason: result.error.reason },
                });
            }
        },
    }),
};

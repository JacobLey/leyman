import { Linter, RuleTester } from 'eslint';
import { expect } from '@leyman/expect';
import { sign } from 'generated-signature';
import plugin from 'generated-signature/eslint';
import { suite, test } from 'mocha-chain';

RuleTester.describe = suite;
RuleTester.it = test;
RuleTester.itOnly = test.only;

const signed = sign(
    [
        'export const a = 1;',
        '// @manual-start custom',
        'export const b = 2;',
        '// @manual-end custom',
        '',
    ].join('\n'),
    { filePath: 'a.ts' }
);

const ruleTester = new RuleTester();
ruleTester.run('generated-signature/valid', plugin.rules.valid, {
    valid: [
        { name: 'Unsigned file', code: 'export const a = 1;\n' },
        { name: 'Signed file', code: signed },
        {
            name: 'Edited manual section',
            code: signed.replace('b = 2', 'b = 3'),
        },
    ],
    invalid: [
        {
            name: 'Edited outside manual sections',
            code: signed.replace('a = 1', 'a = 3'),
            errors: [{ messageId: 'invalid', line: 1 }],
        },
        {
            name: 'Malformed manual section',
            code: signed.replace('// @manual-end custom\n', ''),
            errors: [{ messageId: 'malformed', line: 3 }],
        },
    ],
});

suite('plugin', () => {
    test('recommended turns on valid', () => {
        expect(plugin.configs.recommended.rules).to.deep.equal({
            'generated-signature/valid': 'error',
        });
    });

    test('recommended works on its own', () => {
        const linter = new Linter();
        const messages = linter.verify(signed.replace('a = 1', 'a = 3'), [
            plugin.configs.recommended,
        ]);
        expect(messages.map(({ ruleId }) => ruleId)).to.deep.equal(['generated-signature/valid']);
    });
});

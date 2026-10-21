import { Linter, RuleTester } from 'eslint';
import { expect } from '@leyman/expect';
import plugin from 'juniper/eslint';
import { suite, test } from 'mocha-chain';

RuleTester.describe = suite;
RuleTester.it = test;
RuleTester.itOnly = test.only;

const ruleTester = new RuleTester();
ruleTester.run('juniper/top-level-schema', plugin.rules['top-level-schema'], {
    valid: [
        {
            name: 'Module scope',
            code: "import { objectSchema } from 'juniper';\nexport const a = objectSchema();",
        },
        {
            name: 'Nested in module scope expressions',
            code: "import { stringSchema } from 'juniper';\nexport const a = { b: [stringSchema()] };",
        },
        {
            name: 'Schema methods inside functions',
            code: "import { objectSchema } from 'juniper';\nconst a = objectSchema();\nexport const f = () => a.toJSON();",
        },
        {
            name: 'defineRecursive build callback',
            code: "import { defineRecursive, objectSchema } from 'juniper';\nexport const a = defineRecursive('A', self => objectSchema({ properties: { self } }));",
        },
        {
            name: 'Static class field',
            code: "import { objectSchema } from 'juniper';\nexport class A { static schema = objectSchema(); }",
        },
        {
            name: 'Not imported from juniper',
            code: "import { objectSchema } from 'other';\nexport const f = () => objectSchema();",
        },
        {
            name: 'Global of the same name',
            code: 'export const f = () => objectSchema();',
        },
        {
            name: 'Local function of the same name',
            code: 'const objectSchema = () => 1;\nexport const f = () => objectSchema();',
        },
        {
            name: 'Other juniper exports',
            code: "import { components } from 'juniper';\nexport const f = a => components(a);",
        },
        {
            name: 'Other static methods',
            code: "import { ObjectSchema } from 'juniper';\nexport const f = () => ObjectSchema.from();",
        },
        {
            name: 'Default import',
            code: "import juniper from 'juniper';\nexport const f = () => juniper.objectSchema();",
        },
        {
            name: 'Computed members',
            code: "import * as juniper from 'juniper';\nexport const f = () => juniper['objectSchema']();",
        },
        {
            name: 'Other namespace members',
            code: "import * as juniper from 'juniper';\nexport const f = () => [juniper.isSchema(), juniper.Foo.create(), juniper.ObjectSchema.from()];",
        },
        {
            name: 'Other objects',
            code: "import { objectSchema } from 'juniper';\nexport const f = a => [a()(), a.b.create(), a().create(), a.b.c.create()];",
        },
        {
            name: 'Function called immediately',
            code: "import { objectSchema } from 'juniper';\nexport const a = (() => objectSchema())();\nexport const b = (function () { return objectSchema(); })();",
        },
    ],
    invalid: [
        {
            name: 'Arrow function',
            code: "import { objectSchema } from 'juniper';\nexport const f = () => objectSchema();",
            errors: [{ messageId: 'topLevel', data: { name: 'objectSchema' } }],
        },
        {
            name: 'Function declaration, renamed import',
            code: "import { stringSchema as str } from 'juniper';\nexport function f() { return str(); }",
            errors: [{ messageId: 'topLevel', data: { name: 'stringSchema' } }],
        },
        {
            name: 'Method',
            code: "import { numberSchema } from 'juniper';\nexport class A { m() { return numberSchema(); } }",
            errors: [{ messageId: 'topLevel' }],
        },
        {
            name: 'Instance field',
            code: "import { numberSchema } from 'juniper';\nexport class A { schema = numberSchema(); }",
            errors: [{ messageId: 'topLevel' }],
        },
        {
            name: 'Namespace import',
            code: "import * as juniper from 'juniper';\nexport const f = () => juniper.objectSchema();",
            errors: [{ messageId: 'topLevel', data: { name: 'objectSchema' } }],
        },
        {
            name: 'Static create',
            code: "import { ObjectSchema } from 'juniper';\nexport const f = () => ObjectSchema.create();",
            errors: [{ messageId: 'topLevel', data: { name: 'ObjectSchema.create' } }],
        },
        {
            name: 'Static create from a namespace',
            code: "import * as juniper from 'juniper';\nexport const f = () => juniper.ObjectSchema.create();",
            errors: [{ messageId: 'topLevel', data: { name: 'ObjectSchema.create' } }],
        },
        {
            name: 'Inside a function in a defineRecursive callback',
            code: "import { defineRecursive, objectSchema } from 'juniper';\nexport const a = defineRecursive('A', () => { const f = () => objectSchema(); return f(); });",
            errors: [{ messageId: 'topLevel' }],
        },
        {
            name: 'Function called immediately, inside a function',
            code: "import { objectSchema } from 'juniper';\nexport const f = () => (() => objectSchema())();",
            errors: [{ messageId: 'topLevel' }],
        },
        {
            name: 'A callback of another call',
            code: "import { objectSchema } from 'juniper';\nexport const a = [1].map(() => objectSchema());",
            errors: [{ messageId: 'topLevel' }],
        },
    ],
});

suite('plugin', () => {
    test('recommended turns on top-level-schema', () => {
        expect(plugin.configs.recommended.rules).to.deep.equal({
            'juniper/top-level-schema': 'error',
        });
    });

    test('recommended works on its own', () => {
        const linter = new Linter();
        const messages = linter.verify(
            "import { objectSchema } from 'juniper';\nexport const f = () => objectSchema();",
            [plugin.configs.recommended]
        );
        expect(messages.map(({ ruleId }) => ruleId)).to.deep.equal(['juniper/top-level-schema']);
    });
});

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { expect } from '@leyman/expect';
import { genever } from 'genever';
import { beforeEach, suite } from 'mocha-chain';
import { createProject } from './lib/project.js';

/**
 * A JSON Schema whose JSON a YAML parser could read differently: YAML 1.1 booleans and nulls as keys and
 * values, numbers, escapes, and keys a JSON Pointer escapes.
 */
const trickySchema = {
    $defs: {
        Flags: {
            type: 'object',
            properties: {
                on: { const: true },
                yes: { type: 'string', enum: ['no', 'off', 'null', '~', 'y'] },
                null: { type: 'null' },
                'a/b~c': { type: 'number', enum: [1e3, -0, 0.5, 12_345_678_901_234_567_890] },
                '': { type: 'string' },
                escaped: { const: 'tab\tquote"é😀\0' },
                '0x1F': { const: '0x1F' },
            },
            required: ['on'],
            additionalProperties: false,
        },
    },
    type: 'array',
    items: { $ref: '#/$defs/Flags' },
    minItems: 1,
};

const demoSpec = createRequire(import.meta.url).resolve('@leyman/demo-openapi-spec/openapi.json');

suite('same types as a generated file', () => {
    const withProject = beforeEach(createProject);
    withProject.afterEach(async ({ project }) => {
        await project.tmpDir.cleanup();
    });

    /**
     * Map a JSON document, generate a file from it as the CLI does for a `.json` file, and check every exported
     * type is identical. Generic types are covered by the types they're built from.
     *
     * @param project - project to check in
     * @param fileName - mapped file name
     * @param json - document text
     */
    const expectSameTypes = async (
        project: Awaited<ReturnType<typeof createProject>>['project'],
        fileName: string,
        json: string
    ): Promise<void> => {
        const generated = genever(JSON.parse(json));
        const names = generated
            .matchAll(/^export type (?<name>\w+) =/gmv)
            .map(match => String(match.groups?.name))
            .toArray();
        expect(names).to.not.deep.equal([]);
        await project.write({
            [fileName]: json,
            'generated.ts': generated,
            'check.ts': [
                `import type * as Mapped from './${fileName}';`,
                "import type * as Generated from './generated.js';",
                '',
                'type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;',
                'const same = <T extends true>(): T | void => {};',
                '',
                ...names.map(name => `same<Equal<Mapped.${name}, Generated.${name}>>();`),
                '',
            ].join('\n'),
        });

        expect(await project.check()).to.deep.equal({ code: 0, output: '' });
    };

    withProject.test('a JSON Schema with JSON that YAML could misread', async ({ project }) => {
        await expectSameTypes(project, 'tricky.schema.yaml', JSON.stringify(trickySchema, null, 2));
    });

    withProject.test("the OpenAPI demo's document", async ({ project }) => {
        await expectSameTypes(project, 'notes.openapi.yaml', await readFile(demoSpec, 'utf8'));
    });

    withProject.test('a difference is caught', async ({ project }) => {
        await project.write({
            'a.schema.yaml': 'type: string\n',
            'generated.ts': 'export type Schema = string | number;\n',
            'check.ts': [
                "import type * as Mapped from './a.schema.yaml';",
                "import type * as Generated from './generated.js';",
                '',
                'type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;',
                'const same = <T extends true>(): T | void => {};',
                '',
                'same<Equal<Mapped.Schema, Generated.Schema>>();',
                '',
            ].join('\n'),
        });

        expect(await project.check()).to.have.property('code', 2);
    });
});

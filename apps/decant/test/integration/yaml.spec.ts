import { writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { YAMLError } from 'yaml';
import { expect } from '@leyman/expect';
import {
    decantFile,
    DecantInvalidSchemaError,
    DecantLoadError,
    DecantStrictModeError,
    DecantUnsupportedError,
} from 'decant';
import { beforeEach, suite } from 'mocha-chain';
import { expectTypes } from '../lib/expect-decanted.js';
import { createTmpDir } from './lib/fixtures.js';
import { startSchemaServer } from './lib/server.js';

const data = (file: string): string =>
    Path.join(import.meta.dirname, '../../test/data/external/yaml', file);

suite('YAML', () => {
    const withTmpDir = beforeEach(createTmpDir);
    withTmpDir.afterEach(async ctx => {
        await ctx.tmpDir.cleanup();
    });

    withTmpDir.test('a YAML schema, referencing YAML and JSON files', async ctx => {
        await decantFile(data('root.yaml'), { output: ctx.resolve('root.ts') });

        expectTypes(await ctx.read('root.ts'), {
            Schema: '{ home: Address; work?: Address; item?: Item }',
            Address: '{ city: string; country?: Country }',
            Country: '"US" | "FR"',
            Item: '{ name?: string; count?: number }',
        });
    });

    withTmpDir.test('an OpenAPI document', async ctx => {
        await decantFile(data('openapi.yaml'), { output: ctx.resolve('openapi.ts') });

        expectTypes(await ctx.read('openapi.ts'), {
            User: '{ nickname?: string | null; item?: Item }',
            Item: '{ name?: string; count?: number }',
        });
    });

    withTmpDir.test('writes next to the input, with a .ts extension', async ctx => {
        await writeFile(ctx.resolve('first.yaml'), 'type: string');
        await writeFile(ctx.resolve('second.yml'), 'type: string');

        expect(await decantFile(ctx.resolve('first.yaml'))).to.have.property(
            'output',
            ctx.resolve('first.ts')
        );
        expect(await decantFile(ctx.resolve('second.yml'))).to.have.property(
            'output',
            ctx.resolve('second.ts')
        );
    });

    withTmpDir.test(
        'a URL, by its media type, read as YAML 1.2 (on and off are strings)',
        async ctx => {
            const server = await startSchemaServer();
            try {
                await writeFile(
                    ctx.resolve('input.yaml'),
                    `type: object\nproperties: { switch: { $ref: "${server.url}/as-yaml/remote3" } }`
                );
                await decantFile(ctx.resolve('input.yaml'), { output: ctx.resolve('input.ts') });

                expectTypes(await ctx.read('input.ts'), {
                    Schema: '{ switch?: Remote3 }',
                    Remote3: '"on" | "off"',
                });
            } finally {
                await server.close();
            }
        }
    );

    /**
     * Decant YAML text, and read the types back.
     *
     * @param ctx - test context
     * @param ctx.resolve - path in the temporary directory
     * @param ctx.read - read a file in the temporary directory
     * @param text - YAML schema or document
     * @returns generated TypeScript source
     */
    const decantYaml = async (
        ctx: { read: (path: string) => Promise<string>; resolve: (path: string) => string },
        text: string
    ): Promise<string> => {
        await writeFile(ctx.resolve('input.yaml'), text);
        await decantFile(ctx.resolve('input.yaml'), { output: ctx.resolve('input.ts') });
        return ctx.read('input.ts');
    };

    withTmpDir.test('merge keys', async ctx => {
        const source = await decantYaml(
            ctx,
            [
                'type: object',
                'properties:',
                '  a: &base { type: string, minLength: 1 }',
                '  b:',
                '    <<: *base',
                '    enum: [x, y]',
            ].join('\n')
        );

        expectTypes(source, { Schema: '{ a?: string; b?: "x" | "y" }' });
    });

    suite('a recursive alias is a reference', () => {
        withTmpDir.test('to the root', async ctx => {
            const source = await decantYaml(
                ctx,
                '&node\ntype: object\nproperties:\n  children: { type: array, items: *node }'
            );

            expectTypes(source, { Schema: '{ children?: Schema[] }' });
        });

        withTmpDir.test('to a definition, through keys a pointer escapes', async ctx => {
            const source = await decantYaml(
                ctx,
                [
                    'type: object',
                    'properties:',
                    '  tree: { $ref: "#/$defs/Tree" }',
                    '$defs:',
                    '  Tree: &tree',
                    '    type: object',
                    '    properties:',
                    '      "a/b c%": *tree',
                ].join('\n')
            );

            expectTypes(source, { Schema: '{ tree?: Tree }', Tree: '{ "a/b c%"?: Tree }' });
        });

        withTmpDir.test('to a schema with its own $id', async ctx => {
            const source = await decantYaml(
                ctx,
                [
                    'type: object',
                    'properties:',
                    '  node: &node',
                    '    $id: https://example.test/node',
                    '    type: object',
                    '    properties: { next: *node }',
                ].join('\n')
            );

            expectTypes(source, {
                Schema: '{ node?: PropertiesNode }',
                PropertiesNode: '{ next?: PropertiesNode }',
            });
        });

        withTmpDir.test('in an OpenAPI document', async ctx => {
            const source = await decantYaml(
                ctx,
                [
                    'openapi: 3.1.0',
                    'info: { title: API, version: 1.0.0 }',
                    'paths: {}',
                    'components:',
                    '  schemas:',
                    '    Node: &node { type: object, properties: { next: *node } }',
                ].join('\n')
            );

            expectTypes(source, { Node: '{ next?: Node }' });
        });

        withTmpDir.test('which may refer back to the same value', async ctx => {
            await writeFile(ctx.resolve('input.yaml'), '&self\nanyOf: [*self, { type: string }]');

            await expect(
                decantFile(ctx.resolve('input.yaml'), { output: ctx.resolve('input.ts') })
            ).to.be.rejectedWith(DecantStrictModeError, /refers back/u);
        });

        withTmpDir.test('but not across an $id', async ctx => {
            await writeFile(
                ctx.resolve('input.yaml'),
                [
                    '&root',
                    'type: object',
                    'properties:',
                    '  a: { $id: https://example.test/a, type: object, properties: { b: *root } }',
                ].join('\n')
            );

            await expect(
                decantFile(ctx.resolve('input.yaml'), { output: ctx.resolve('input.ts') })
            ).to.be.rejectedWith(DecantUnsupportedError, /\$id in between/u);
        });
    });

    suite('without a JSON equivalent', () => {
        const parseErrors = {
            'a key that is not a string': '? [a]\n: { type: string }',
            'a duplicate key': 'type: string\ntype: number',
            'a tag outside the core schema': 'const: !!binary aGk=',
            'an unknown tag': 'const: !thing x',
            'more than one document': 'type: string\n---\ntype: number',
            'invalid YAML': 'type: [string',
        };
        for (const [name, text] of Object.entries(parseErrors)) {
            withTmpDir.test(name, async ctx => {
                await writeFile(ctx.resolve('input.yaml'), text);

                await expect(
                    decantFile(ctx.resolve('input.yaml'), { output: ctx.resolve('input.ts') })
                ).to.be.rejectedWith(YAMLError);
            });
        }

        const valueErrors = {
            'an infinite number': ['maximum: .inf', '#/maximum'],
            'not a number': ['properties: { a: { const: .nan } }', '#/properties/a/const'],
            'a recursive value that is not a schema': ['const: &value [*value]', '#/const/0'],
            'a recursive array of schemas': ['allOf: &all [*all]', '#/allOf/0'],
            'a recursive map of schemas': ['&schema { properties: *schema }', '#/properties'],
            'a collection keyword that is not a collection': [
                'type: object\nproperties: 5',
                '#/properties',
            ],
        };
        for (const [name, [text, pointer]] of Object.entries(valueErrors)) {
            withTmpDir.test(name, async ctx => {
                await writeFile(ctx.resolve('input.yaml'), text!);

                const thrown: unknown = await expect(
                    decantFile(ctx.resolve('input.yaml'), { output: ctx.resolve('input.ts') })
                ).to.be.rejectedWith(DecantInvalidSchemaError);
                expect(thrown).to.have.property('pointer', pointer);
            });
        }

        withTmpDir.test('a referenced file', async ctx => {
            await writeFile(ctx.resolve('input.yaml'), '$ref: ./broken.yaml');
            await writeFile(ctx.resolve('broken.yaml'), 'maximum: .inf');

            const thrown: unknown = await expect(
                decantFile(ctx.resolve('input.yaml'), { output: ctx.resolve('input.ts') })
            ).to.be.rejectedWith(DecantLoadError, /not valid YAML: YAML number Infinity/u);
            expect((thrown as Error).cause).to.be.instanceOf(DecantInvalidSchemaError);
        });
    });
});

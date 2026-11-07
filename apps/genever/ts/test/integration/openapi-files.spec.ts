import type { TmpDirContext } from './lib/fixtures.js';
import Path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect } from '@leyman/expect';
import {
    geneverFile,
    GeneverInvalidSchemaError,
    GeneverLoadError,
    GeneverStrictModeError,
} from 'genever';
import { beforeEach, suite } from 'mocha-chain';
import {
    assertionImports,
    equivalentAssertion,
    expectTypes,
    normalizeModule,
} from '../lib/expect-generated.js';
import { typeCheck } from '../lib/type-check.js';
import { createTmpDir } from './lib/fixtures.js';

const data = (file: string): string =>
    Path.join(import.meta.dirname, '../../test/data/external', file);

/**
 * Assert two generated modules have equivalent types of the same names.
 *
 * @param actual - generated TypeScript source
 * @param expected - generated TypeScript source it should be equivalent to
 * @param names - type expressions to compare, over each module's exports (e.g. `Paths`)
 */
const expectSameTypes = (actual: string, expected: string, names: readonly string[]): void => {
    const assertion = [
        ...assertionImports,
        "import type * as Actual from './actual.js';",
        "import type * as Expected from './expected.js';",
        ...names.map(name => equivalentAssertion(`Actual.${name}`, `Expected.${name}`)),
    ].join('\n');

    expect(
        typeCheck({
            'actual.ts': actual,
            'assertion.ts': assertion,
            'expected.ts': expected,
            'normalize.ts': normalizeModule,
        }),
        `Generated:\n${actual}`
    ).to.deep.equal([]);
};

const info = { title: 'API', version: '1.0.0' };

suite('OpenAPI documents split across files', () => {
    const withTmpDir = beforeEach(createTmpDir);
    withTmpDir.afterEach(async ctx => {
        await ctx.tmpDir.cleanup();
    });

    /**
     * Generate types for a file into the temporary directory, and read them back.
     *
     * @param ctx - test context, with the temporary directory
     * @param input - path of the document
     * @param output - name of the file to write the types to, in the temporary directory
     * @returns generated TypeScript source
     */
    const generate = async (ctx: TmpDirContext, input: string, output: string): Promise<string> => {
        await geneverFile(input, { output: ctx.resolve(output) });
        return ctx.read(output);
    };

    withTmpDir.test('the same types as the single file', async ctx => {
        const split = await generate(ctx, data('split/api.json'), 'split.ts');
        const single = await generate(ctx, data('split/single.json'), 'single.ts');

        expectSameTypes(split, single, [
            'Paths',
            'Operations',
            'Pet',
            'Problem',
            'Code',
            'Limit',
            'Detail',
        ]);
    });

    withTmpDir.test('only the schemas used from another document are types', async ctx => {
        const source = await generate(ctx, data('split/api.json'), 'split.ts');

        // Its paths aren't loaded either: `/unused` refers to a file that doesn't exist
        expect(source).not.to.contain('Unused');
    });

    withTmpDir.test('OpenAPI 3.0, in YAML', async ctx => {
        const split = await generate(ctx, data('split-30/api.yaml'), 'split.ts');
        const single = await generate(ctx, data('split-30/single.yaml'), 'single.ts');

        expectSameTypes(split, single, ['Paths', 'Operations', 'Owner']);
        expectTypes(split, { Owner: '{ name: string; nickname?: string | null }' });
    });

    withTmpDir.test("another document's schemas are in its own dialect", async ctx => {
        await ctx.writeJson('api.json', {
            info,
            openapi: '3.1.0',
            paths: {},
            components: {
                schemas: {
                    User: {
                        type: 'object',
                        properties: {
                            owner: { $ref: './common.json#/components/schemas/Owner' },
                            nickname: {
                                $ref: './common.json#/components/schemas/Owner/properties/nickname',
                            },
                        },
                    },
                },
            },
        });
        await ctx.writeJson('common.json', {
            info,
            openapi: '3.0.3',
            paths: {},
            components: {
                schemas: {
                    Owner: {
                        type: 'object',
                        properties: {
                            nickname: { type: 'string', nullable: true },
                            age: { type: 'integer', minimum: 0, exclusiveMinimum: true },
                        },
                    },
                },
            },
        });

        const source = await generate(ctx, ctx.resolve('api.json'), 'api.ts');

        expectTypes(source, {
            User: '{ owner?: Owner; nickname?: ComponentsSchemasOwnerPropertiesNickname }',
            Owner: '{ nickname?: string | null; age?: number }',
            // Named after its whole path, as in the input
            ComponentsSchemasOwnerPropertiesNickname: 'string | null',
        });
    });

    withTmpDir.test('a reference by anchor into another document', async ctx => {
        await ctx.writeJson('api.json', {
            info,
            openapi: '3.1.0',
            paths: {},
            components: { schemas: { User: { $ref: './common.json#owner' } } },
        });
        await ctx.writeJson('common.json', {
            info,
            openapi: '3.1.0',
            components: { schemas: { Owner: { $anchor: 'owner', type: 'string' } } },
        });

        const source = await generate(ctx, ctx.resolve('api.json'), 'api.ts');

        expectTypes(source, { User: 'Owner', Owner: 'string' });
    });

    withTmpDir.test('a reference object that refers to another', async ctx => {
        await ctx.writeJson('api.json', {
            info,
            openapi: '3.1.0',
            paths: { '/a': { $ref: './paths.json#/a' } },
        });
        await ctx.writeJson('paths.json', { a: { $ref: './a.json' } });
        const pathItem = {
            get: { operationId: 'getA', responses: { 204: { description: 'Done' } } },
        };
        await ctx.writeJson('a.json', pathItem);
        await ctx.writeJson('single.json', { info, openapi: '3.1.0', paths: { '/a': pathItem } });

        const split = await generate(ctx, ctx.resolve('api.json'), 'api.ts');
        const single = await generate(ctx, ctx.resolve('single.json'), 'single.ts');

        expectSameTypes(split, single, ['Paths', 'Operations']);
    });

    suite('errors', () => {
        /**
         * Write a document whose `/a` path item refers to an object, and the files it needs.
         *
         * @param ctx - test context, with the temporary directory
         * @param pathItem - the `/a` path item
         * @param files - other files to write, keyed by name
         * @returns promise of generating types for the document
         */
        const generateWith = async (
            ctx: TmpDirContext,
            pathItem: unknown,
            files: Readonly<Record<string, unknown>> = {}
        ): Promise<unknown> => {
            await ctx.writeJson('api.json', { info, openapi: '3.1.0', paths: { '/a': pathItem } });
            for (const [name, content] of Object.entries(files)) {
                await ctx.writeJson(name, content);
            }
            return geneverFile(ctx.resolve('api.json'), { output: ctx.resolve('api.ts') });
        };

        withTmpDir.test('name the file the error is in', async ctx => {
            const thrown: unknown = await expect(
                generateWith(
                    ctx,
                    {
                        get: {
                            responses: {
                                200: {
                                    description: 'ok',
                                    content: {
                                        'application/json': {
                                            schema: {
                                                $ref: './common.json#/components/schemas/A',
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    {
                        'common.json': {
                            info,
                            openapi: '3.1.0',
                            components: { schemas: { A: { type: 'string', unknown: true } } },
                        },
                    }
                )
            ).to.be.rejectedWith(GeneverStrictModeError);
            expect(thrown).to.have.property(
                'pointer',
                `${pathToFileURL(ctx.resolve('common.json')).href}#/components/schemas/A/unknown`
            );
        });

        withTmpDir.test('a document of an unsupported OpenAPI version', async ctx => {
            const thrown: unknown = await expect(
                generateWith(
                    ctx,
                    { $ref: './old.json#/paths/~1a' },
                    { 'old.json': { swagger: 2, openapi: '2.0' } }
                )
            ).to.be.rejectedWith(GeneverLoadError, /Only OpenAPI 3\.0 and 3\.1/v);
            expect(thrown).to.have.property('pointer', '#/paths/~1a/$ref');
        });

        withTmpDir.test('a reference to nothing in a file', async ctx => {
            await expect(
                generateWith(ctx, { $ref: './paths.json#/b' }, { 'paths.json': { a: {} } })
            ).to.be.rejectedWith(GeneverInvalidSchemaError, /does not resolve/v);
        });

        withTmpDir.test('a reference that is not a valid fragment', async ctx => {
            await expect(
                generateWith(ctx, { $ref: './paths.json#/%E0' }, { 'paths.json': { a: {} } })
            ).to.be.rejectedWith(GeneverInvalidSchemaError, /Invalid \$ref/v);
        });

        withTmpDir.test('a reference object whose $ref is not a string', async ctx => {
            await expect(generateWith(ctx, { $ref: 1 })).to.be.rejectedWith(
                GeneverInvalidSchemaError,
                /\$ref must be a string/v
            );
        });

        withTmpDir.test('reference objects that only refer to each other', async ctx => {
            const thrown: unknown = await expect(
                generateWith(
                    ctx,
                    { $ref: './paths.json#/a' },
                    { 'paths.json': { a: { $ref: '#/b' }, b: { $ref: '#/a' } } }
                )
            ).to.be.rejectedWith(GeneverInvalidSchemaError, /only refers to itself/v);
            expect(thrown).to.have.property('pointer', '#/paths/~1a/$ref');
        });
    });
});

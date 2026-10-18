/* eslint-disable no-template-curly-in-string -- expected types are TypeScript source, with template literal types */
import { readFile, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { expect } from '@leyman/expect';
import { decantFile, DecantLoadError } from 'decant';
import { beforeEach, suite } from 'mocha-chain';
import { expectTypes } from '../lib/expect-decanted.js';
import { createTmpDir } from './lib/fixtures.js';
import { startSchemaServer } from './lib/server.js';

const data = (file: string): string =>
    Path.join(import.meta.dirname, '../../test/data/external', file);

suite('external references', () => {
    const withTmpDir = beforeEach(createTmpDir);
    withTmpDir.afterEach(async ctx => {
        await ctx.tmpDir.cleanup();
    });

    /**
     * Decant a file into the temporary directory, and read the types back.
     *
     * @param input - path of the schema to decant
     * @param output - path to write the types to
     * @param options - passed to decantFile
     * @param options.name - name of the root schema's type
     * @returns generated TypeScript source
     */
    const decantTo = async (
        input: string,
        output: string,
        options: { name?: string } = {}
    ): Promise<string> => {
        await decantFile(input, { output, ...options });
        return readFile(output, 'utf8');
    };

    withTmpDir.test('bundles referenced files into one', async ctx => {
        const source = await decantTo(data('root.json'), ctx.resolve('root.ts'));

        expectTypes(source, {
            Schema: '{ home: Address; work?: Address; billing?: Address2; name?: Name; email?: Email; tree?: Tree; money?: Money }',
            Address: '{ city: string; country?: Country }',
            Address2: '{ line1: string }',
            Country: '"US" | "FR"',
            Name: 'string',
            Email: 'string',
            Tree: '{ value: number; children: Tree[] }',
            Money: '{ currency?: Currency2 }',
            Currency2: '"USD" | "EUR"',
        });
    });

    withTmpDir.test('a file that only groups definitions is not a type', async ctx => {
        const source = await decantTo(data('root.json'), ctx.resolve('root.ts'));

        expect(source).not.to.contain('SharedDefinitions');
    });

    withTmpDir.test('an input without definitions', async ctx => {
        const source = await decantTo(data('no-defs.json'), ctx.resolve('no-defs.ts'));

        expectTypes(source, {
            Schema: '{ tree?: Tree }',
            Tree: '{ value: number; children: Tree[] }',
        });
    });

    withTmpDir.test('a file that refers back to the input', async ctx => {
        const source = await decantTo(data('cycle.json'), ctx.resolve('cycle.ts'));

        expectTypes(source, {
            Schema: '{ child?: CycleChild }',
            CycleChild: '{ parent?: Schema }',
        });
    });

    withTmpDir.test('URLs, and their relative references', async ctx => {
        const server = await startSchemaServer();
        try {
            await writeFile(
                ctx.resolve('input.json'),
                JSON.stringify({
                    type: 'object',
                    properties: {
                        remote: { $ref: `${server.url}/remote.json` },
                        root: { $ref: `${server.url}/` },
                    },
                })
            );
            const source = await decantTo(ctx.resolve('input.json'), ctx.resolve('input.ts'), {
                name: 'Input',
            });

            expectTypes(source, {
                Input: '{ remote?: Remote; root?: Schema }',
                Remote: '{ id?: Remote2 }',
                Remote2: '`rem_${string}`',
                Schema: 'boolean',
            });
        } finally {
            await server.close();
        }
    });

    withTmpDir.test('OpenAPI document', async ctx => {
        const source = await decantTo(data('openapi.json'), ctx.resolve('openapi.ts'));

        expectTypes(source, {
            User: 'Address',
            Address: '{ city: string; country?: Country }',
            Country: '"US" | "FR"',
            Tree: '{ value: number; children: Tree[] }',
        });
    });

    withTmpDir.test(
        'files referenced by an OpenAPI 3.0 document are OpenAPI 3.0 schemas',
        async ctx => {
            const source = await decantTo(data('openapi-30.json'), ctx.resolve('openapi-30.ts'));

            expectTypes(source, {
                User: 'Nullable',
                Nullable: '{ nickname?: string | null; age?: number }',
            });
        }
    );

    withTmpDir.test('in parallel', async ctx => {
        const [first, second] = await Promise.all([
            decantTo(data('no-defs.json'), ctx.resolve('first.ts')),
            decantTo(data('cycle.json'), ctx.resolve('second.ts')),
        ]);

        expect(first).to.contain('Tree');
        expect(second).to.contain('CycleChild');
    });

    withTmpDir.test('a file that does not exist', async ctx => {
        await expect(
            decantFile(data('missing.json'), { output: ctx.resolve('missing.ts') })
        ).to.be.rejectedWith(DecantLoadError);
    });

    withTmpDir.test('loads again after a failure', async ctx => {
        await expect(
            decantFile(data('missing.json'), { output: ctx.resolve('missing.ts') })
        ).to.be.rejectedWith(DecantLoadError);

        expect(await decantTo(data('no-defs.json'), ctx.resolve('no-defs.ts'))).to.contain('Tree');
    });
});

/* eslint-disable no-template-curly-in-string -- expected types are TypeScript source, with template literal types */
import type { TmpDirContext } from './lib/fixtures.js';
import { readFile, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect } from '@leyman/expect';
import { geneverFile, GeneverLoadError } from 'genever';
import { beforeEach, suite } from 'mocha-chain';
import { expectTypes } from '../lib/expect-generated.js';
import { fakeFetch } from './lib/fake-fetch.js';
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
     * Generate types for a file into the temporary directory, and read them back.
     *
     * @param input - path of the schema to genever
     * @param output - path to write the types to
     * @param options - passed to geneverFile
     * @param options.name - name of the root schema's type
     * @returns generated TypeScript source
     */
    const generateTo = async (
        input: string,
        output: string,
        options: { name?: string } = {}
    ): Promise<string> => {
        await geneverFile(input, { output, ...options });
        return readFile(output, 'utf8');
    };

    withTmpDir.test('bundles referenced files into one', async ctx => {
        const source = await generateTo(data('root.json'), ctx.resolve('root.ts'));

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
        const source = await generateTo(data('root.json'), ctx.resolve('root.ts'));

        expect(source).not.to.contain('SharedDefinitions');
    });

    withTmpDir.test('an input without definitions', async ctx => {
        const source = await generateTo(data('no-defs.json'), ctx.resolve('no-defs.ts'));

        expectTypes(source, {
            Schema: '{ tree?: Tree }',
            Tree: '{ value: number; children: Tree[] }',
        });
    });

    withTmpDir.test('a file that refers back to the input', async ctx => {
        const source = await generateTo(data('cycle.json'), ctx.resolve('cycle.ts'));

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
            const source = await generateTo(ctx.resolve('input.json'), ctx.resolve('input.ts'), {
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
        const source = await generateTo(data('openapi.json'), ctx.resolve('openapi.ts'));

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
            const source = await generateTo(data('openapi-30.json'), ctx.resolve('openapi-30.ts'));

            expectTypes(source, {
                User: 'Nullable',
                Nullable: '{ nickname?: string | null; age?: number }',
            });
        }
    );

    withTmpDir.test('in parallel', async ctx => {
        const [first, second] = await Promise.all([
            generateTo(data('no-defs.json'), ctx.resolve('first.ts')),
            generateTo(data('cycle.json'), ctx.resolve('second.ts')),
        ]);

        expect(first).to.contain('Tree');
        expect(second).to.contain('CycleChild');
    });

    withTmpDir.test(
        'a file whose $id is not its path, a draft 7 anchor, and a boolean schema',
        async ctx => {
            // `elsewhere` is never loaded (fetch is off), but another file declares it
            await geneverFile(data('assorted.json'), {
                output: ctx.resolve('assorted.ts'),
                fetch: false,
            });

            expectTypes(await ctx.read('assorted.ts'), {
                Schema: '{ declared?: Declared; thing?: AnchorId; nothing?: Nothing; elsewhere?: Elsewhere; declaring?: Elsewhere; everything?: Everything }',
                Declared: 'string',
                AnchorId: 'number',
                Nothing: 'never',
                Elsewhere: 'boolean',
                Everything: 'unknown',
            });
        }
    );

    suite('draft-04', () => {
        // eslint-disable-next-line unicorn/prefer-https -- draft-04's own $schema is http
        const draft04 = 'http://json-schema.org/draft-04/schema#';

        withTmpDir.test('a loaded file names resources with id', async ctx => {
            await ctx.writeJson('input.json', {
                type: 'object',
                properties: { legacy: { $ref: './legacy.json' } },
            });
            await ctx.writeJson('legacy.json', {
                $schema: draft04,
                id: 'https://example.test/legacy.json',
                type: 'object',
                properties: { item: { $ref: 'item.json' } },
                definitions: { Item: { id: 'item.json', type: 'string' } },
            });
            await geneverFile(ctx.resolve('input.json'), {
                output: ctx.resolve('input.ts'),
                fetch: false,
            });

            expectTypes(await ctx.read('input.ts'), {
                Schema: '{ legacy?: Legacy }',
                Legacy: '{ item?: Item }',
                Item: 'string',
            });
        });

        withTmpDir.test("a file without a $schema is in the input's dialect", async ctx => {
            await ctx.writeJson('input.json', {
                $schema: draft04,
                type: 'object',
                properties: { plain: { $ref: './plain.json' } },
            });
            await ctx.writeJson('plain.json', {
                type: 'object',
                properties: { b: { $ref: 'https://example.test/b' } },
                definitions: { B: { id: 'https://example.test/b', type: 'number' } },
            });
            await geneverFile(ctx.resolve('input.json'), {
                output: ctx.resolve('input.ts'),
                fetch: false,
            });

            expectTypes(await ctx.read('input.ts'), {
                Schema: '{ plain?: Plain }',
                Plain: '{ b?: B }',
                B: 'number',
            });
        });
    });

    suite('allowed hosts', () => {
        // Keyed as `fetch` is called with it, e.g. lowercase
        const schemaAt = (url: string): Record<string, string> => {
            const { href } = new URL(url);
            return { [href]: '{ "type": "string" }' };
        };

        /**
         * Generate types for a schema that references a URL.
         *
         * @param ctx - test context
         * @param url - URL of a schema, whose file name is `a.json`
         * @param fetch - allowed hosts
         * @returns generated TypeScript source
         */
        const generateFor = async (
            ctx: TmpDirContext,
            url: string,
            fetch: readonly string[]
        ): Promise<string> => {
            await ctx.writeJson('input.json', {
                type: 'object',
                properties: { a: { $ref: url } },
            });
            await geneverFile(ctx.resolve('input.json'), {
                output: ctx.resolve('input.ts'),
                fetch,
            });
            return ctx.read('input.ts');
        };

        // Allowed hosts, and a URL they allow
        const allowed: Record<string, [readonly string[], string]> = {
            'a host': [['example.test'], 'https://example.test/a.json'],
            'a host on any port': [['example.test'], 'https://example.test:8443/a.json'],
            'a host and port': [['example.test:8443'], 'https://example.test:8443/a.json'],
            'the default port': [['example.test:443'], 'https://example.test/a.json'],
            'any case': [['EXAMPLE.test'], 'https://example.TEST/a.json'],
            'an IPv6 address': [['[::1]:8080'], 'http://[0::1]:8080/a.json'],
            'a subdomain': [['*.example.test'], 'https://api.example.test/a.json'],
            'a nested subdomain': [['*.example.test'], 'https://v1.api.example.test/a.json'],
            'one of many hosts': [['other.test', 'example.test'], 'https://example.test/a.json'],
        };
        for (const [name, [hosts, url]] of Object.entries(allowed)) {
            withTmpDir.test(`allows ${name}`, async ctx => {
                const fake = fakeFetch({ schemas: schemaAt(url) });
                try {
                    expectTypes(await generateFor(ctx, url, hosts), {
                        Schema: '{ a?: A }',
                        A: 'string',
                    });
                } finally {
                    fake.restore();
                }
            });
        }

        // Allowed hosts, and a URL they don't allow
        const disallowed: Record<string, [readonly string[], string]> = {
            'a subdomain of a host': [['example.test'], 'https://api.example.test/a.json'],
            'another port': [['example.test:8443'], 'https://example.test/a.json'],
            'the domain of its subdomains': [['*.example.test'], 'https://example.test/a.json'],
            'a host that ends the same': [['*.example.test'], 'https://badexample.test/a.json'],
            'no hosts': [[], 'https://example.test/a.json'],
        };
        for (const [name, [hosts, url]] of Object.entries(disallowed)) {
            withTmpDir.test(`does not allow ${name}`, async ctx => {
                const fake = fakeFetch({ schemas: schemaAt(url) });
                try {
                    await expect(generateFor(ctx, url, hosts)).to.be.rejectedWith(
                        GeneverLoadError,
                        /not an allowed host/u
                    );
                    expect(fake.requested).to.deep.equal([]);
                } finally {
                    fake.restore();
                }
            });
        }

        withTmpDir.test('follows redirects to allowed hosts', async ctx => {
            const fake = fakeFetch({
                redirects: { 'https://example.test/a.json': 'https://cdn.example.test/v2/a.json' },
                schemas: schemaAt('https://cdn.example.test/v2/a.json'),
            });
            try {
                expectTypes(
                    await generateFor(ctx, 'https://example.test/a.json', [
                        'example.test',
                        '*.example.test',
                    ]),
                    { Schema: '{ a?: A }', A: 'string' }
                );
            } finally {
                fake.restore();
            }
        });

        withTmpDir.test('resolves references against where a URL redirects to', async ctx => {
            const fake = fakeFetch({
                redirects: { 'https://example.test/v1/a.json': 'https://example.test/v2/a.json' },
                schemas: {
                    'https://example.test/v2/a.json': '{ "$ref": "./b.json" }',
                    'https://example.test/v2/b.json': '{ "type": "string" }',
                },
            });
            try {
                expectTypes(
                    await generateFor(ctx, 'https://example.test/v1/a.json', ['example.test']),
                    { Schema: '{ a?: B }', B: 'string' }
                );
            } finally {
                fake.restore();
            }
        });

        withTmpDir.test('does not follow redirects to other hosts', async ctx => {
            const fake = fakeFetch({
                redirects: { 'https://example.test/a.json': 'https://elsewhere.test/a.json' },
                schemas: schemaAt('https://elsewhere.test/a.json'),
            });
            try {
                await expect(
                    generateFor(ctx, 'https://example.test/a.json', ['example.test'])
                ).to.be.rejectedWith(GeneverLoadError, /elsewhere\.test is not an allowed host/u);
                expect(fake.requested).to.deep.equal(['https://example.test/a.json']);
            } finally {
                fake.restore();
            }
        });

        withTmpDir.test('does not follow redirects to files', async ctx => {
            const fake = fakeFetch({
                redirects: { 'https://example.test/a.json': 'file:///etc/passwd' },
                schemas: {},
            });
            try {
                await expect(
                    generateFor(ctx, 'https://example.test/a.json', ['example.test'])
                ).to.be.rejectedWith(GeneverLoadError, /redirected to a file: URI/u);
            } finally {
                fake.restore();
            }
        });

        withTmpDir.test('does not follow redirects forever', async ctx => {
            const fake = fakeFetch({
                redirects: { 'https://example.test/a.json': 'https://example.test/a.json' },
                schemas: {},
            });
            try {
                await expect(
                    generateFor(ctx, 'https://example.test/a.json', ['example.test'])
                ).to.be.rejectedWith(GeneverLoadError, /too many redirects/u);
            } finally {
                fake.restore();
            }
        });

        withTmpDir.test('a server, and its relative references', async ctx => {
            const server = await startSchemaServer();
            const { host } = new URL(server.url);
            try {
                await ctx.writeJson('input.json', { $ref: `${server.url}/remote.json` });
                await geneverFile(ctx.resolve('input.json'), {
                    output: ctx.resolve('input.ts'),
                    fetch: [host],
                });

                expectTypes(await ctx.read('input.ts'), { Remote2: '`rem_${string}`' });
            } finally {
                await server.close();
            }
        });

        withTmpDir.test('something that is not a host', async ctx => {
            await expect(
                generateFor(ctx, 'https://example.test/a.json', ['https://example.test'])
            ).to.be.rejectedWith(TypeError, 'Not a host: "https://example.test"');
        });
    });

    suite('can not load', () => {
        // Each `$ref`, and the name of the error that caused the failure, if there was one
        const unloadable = {
            'a file that is not JSON': ['./broken.json', 'SyntaxError'],
            'a file that is not a schema': ['./array.json', null],
            'an unsupported scheme': ['ftp://example.test/schema.json', null],
        } as const;
        for (const [name, [ref, causeName]] of Object.entries(unloadable)) {
            withTmpDir.test(name, async ctx => {
                await writeFile(ctx.resolve('input.json'), JSON.stringify({ $ref: ref }));
                await writeFile(ctx.resolve('broken.json'), '{ not json');
                await writeFile(ctx.resolve('array.json'), '[]');

                const thrown: unknown = await expect(
                    geneverFile(ctx.resolve('input.json'), { output: ctx.resolve('input.ts') })
                ).to.be.rejectedWith(GeneverLoadError);
                const { cause } = thrown as { cause?: Error };
                expect(cause?.name).to.equal(causeName ?? undefined);
            });
        }

        withTmpDir.test('a URL, with fetch disabled', async ctx => {
            const server = await startSchemaServer();
            try {
                await writeFile(
                    ctx.resolve('input.json'),
                    JSON.stringify({ $ref: `${server.url}/remote.json` })
                );

                await expect(
                    geneverFile(ctx.resolve('input.json'), {
                        output: ctx.resolve('input.ts'),
                        fetch: false,
                    })
                ).to.be.rejectedWith(GeneverLoadError, /disabled/u);
            } finally {
                await server.close();
            }
        });

        withTmpDir.test('a URL that is not found', async ctx => {
            const server = await startSchemaServer();
            try {
                await writeFile(
                    ctx.resolve('input.json'),
                    JSON.stringify({ properties: { a: { $ref: `${server.url}/missing.json` } } })
                );

                const thrown: unknown = await expect(
                    geneverFile(ctx.resolve('input.json'), {
                        output: ctx.resolve('input.ts'),
                        strict: false,
                    })
                ).to.be.rejectedWith(GeneverLoadError, /404/u);
                expect(thrown).to.have.property('pointer', '#/properties/a/$ref');
                expect(thrown).to.have.property(
                    'referencedFrom',
                    pathToFileURL(ctx.resolve('input.json')).href
                );
                expect(thrown).not.to.have.property('cause');
            } finally {
                await server.close();
            }
        });

        withTmpDir.test('a file that a loaded file references', async ctx => {
            await ctx.writeJson('input.json', { $ref: './a.json' });
            await ctx.writeJson('a.json', { properties: { b: { $ref: './missing.json' } } });

            const thrown: unknown = await expect(
                geneverFile(ctx.resolve('input.json'), {
                    output: ctx.resolve('input.ts'),
                    strict: false,
                })
            ).to.be.rejectedWith(GeneverLoadError, /referenced from ".*\/a\.json"/u);
            expect(thrown).to.have.property('pointer', '#/properties/b/$ref');
            expect(thrown).to.have.property(
                'referencedFrom',
                pathToFileURL(ctx.resolve('a.json')).href
            );
        });
    });

    withTmpDir.test('a file that does not exist', async ctx => {
        const thrown: unknown = await expect(
            geneverFile(data('missing.json'), { output: ctx.resolve('missing.ts') })
        ).to.be.rejectedWith(GeneverLoadError);
        expect((thrown as Error).cause).to.have.property('code', 'ENOENT');
    });

    withTmpDir.test('loads again after a failure', async ctx => {
        await expect(
            geneverFile(data('missing.json'), { output: ctx.resolve('missing.ts') })
        ).to.be.rejectedWith(GeneverLoadError);

        expect(await generateTo(data('no-defs.json'), ctx.resolve('no-defs.ts'))).to.contain(
            'Tree'
        );
    });
});

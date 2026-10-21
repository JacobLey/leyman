import { expect } from '@leyman/expect';
import { genever, GeneverInvalidSchemaError } from 'genever';
import { suite, test } from 'mocha-chain';
import {
    assertionImports,
    equivalentAssertion,
    normalizeModule,
} from '../../lib/expect-generated.js';
import { typeCheck } from '../../lib/type-check.js';

const document = (
    paths: Record<string, unknown>,
    components: Record<string, unknown> = {}
): unknown => ({
    paths,
    openapi: '3.1.0',
    info: { title: 'API', version: '1.0.0' },
    components: {
        schemas: { User: { type: 'object', properties: { id: { type: 'string' } } } },
        ...components,
    },
});

/**
 * Assert type expressions over the generated module (e.g. `G.Operations["getUser"]`) are equivalent to
 * the expected types.
 *
 * @param input - OpenAPI document
 * @param expected - TypeScript source of each expected type, keyed by an expression of `G`, the generated module
 */
const expectOperations = (input: unknown, expected: Readonly<Record<string, string>>): void => {
    const source = genever(input);
    const assertion = [
        ...assertionImports,
        "import type * as G from './generated.js';",
        'type User = G.User;',
        ...Object.entries(expected).map(([actual, type]) => equivalentAssertion(actual, type)),
    ].join('\n');
    expect(
        typeCheck({
            'assertion.ts': assertion,
            'generated.ts': source,
            'normalize.ts': normalizeModule,
        }),
        `Generated:\n${source}`
    ).to.deep.equal([]);
};

const userRef = { $ref: '#/components/schemas/User' };
const jsonUser = { content: { 'application/json': { schema: userRef } } };

suite('OpenAPI operations', () => {
    test('paths by method, and operations by operationId', () => {
        expectOperations(
            document({
                '/users/{id}': {
                    get: { operationId: 'getUser', responses: { 200: jsonUser } },
                },
            }),
            {
                'G.Paths["/users/{id}"]["get"]': 'G.Operations["getUser"]',
                'G.Paths["/users/{id}"]["post"]': 'undefined',
                'G.Operations["getUser"]["responses"][200]["content"]["application/json"]': 'User',
                'G.Operations["getUser"]["requestBody"]': 'undefined',
            }
        );
    });

    test('an operation without operationId is inline', () => {
        expectOperations(
            document({
                '/ping': { get: { responses: { 204: { description: 'Pong' } } }, head: {} },
            }),
            {
                'G.Paths["/ping"]["head"]["responses"]': '{}',
                'G.Paths["/ping"]["get"]["responses"][204]':
                    '{ headers: { [key: string]: unknown }; content?: never }',
                'G.Operations': '{}',
            }
        );
    });

    test('parameters by location', () => {
        expectOperations(
            document(
                {
                    '/users/{id}': {
                        parameters: [
                            { name: 'id', in: 'path', schema: { type: 'string' } },
                            { name: 'trace', in: 'header', schema: { type: 'string' } },
                        ],
                        get: {
                            operationId: 'getUser',
                            parameters: [
                                { name: 'fields', in: 'query', schema: { type: 'string' } },
                                {
                                    name: 'page',
                                    in: 'query',
                                    required: true,
                                    schema: { type: 'integer' },
                                },
                                // Replaces the path item's
                                {
                                    name: 'trace',
                                    in: 'header',
                                    required: true,
                                    schema: { type: 'boolean' },
                                },
                                { $ref: '#/components/parameters/Session' },
                                {
                                    name: 'filter',
                                    in: 'query',
                                    content: { 'application/json': { schema: { type: 'number' } } },
                                },
                            ],
                            responses: {},
                        },
                    },
                },
                {
                    parameters: {
                        Session: { name: 'session', in: 'cookie', schema: { type: 'string' } },
                    },
                }
            ),
            {
                'G.Operations["getUser"]["parameters"]': `{
                    query: { fields?: string; page: number; filter?: number };
                    header: { trace: boolean };
                    path: { id: string };
                    cookie?: { session?: string };
                }`,
                'G.Paths["/users/{id}"]["parameters"]': `{
                    query?: never;
                    header?: { trace?: string };
                    path: { id: string };
                    cookie?: never;
                }`,
            }
        );
    });

    test('request bodies and responses, including references', () => {
        expectOperations(
            document(
                {
                    '/users': {
                        post: {
                            operationId: 'createUser',
                            requestBody: { $ref: '#/components/requestBodies/NewUser' },
                            responses: {
                                201: { $ref: '#/components/responses/Created' },
                                default: { description: 'Error', content: { 'text/plain': {} } },
                            },
                        },
                        put: {
                            operationId: 'putUser',
                            requestBody: jsonUser,
                            responses: {},
                        },
                    },
                },
                {
                    requestBodies: { NewUser: { required: true, ...jsonUser } },
                    responses: {
                        Created: {
                            description: 'Created',
                            headers: {
                                Location: { required: true, schema: { type: 'string' } },
                                'X-Rate': { $ref: '#/components/headers/Rate' },
                                Empty: {},
                            },
                            ...jsonUser,
                        },
                    },
                    headers: {
                        Rate: { content: { 'text/plain': { schema: { type: 'integer' } } } },
                    },
                }
            ),
            {
                'G.Operations["createUser"]["requestBody"]':
                    '{ content: { "application/json": User } }',
                'G.Operations["putUser"]["requestBody"]':
                    '{ content: { "application/json": User } } | undefined',
                'G.Operations["createUser"]["responses"]': `{
                    201: {
                        headers: { Location: string; "X-Rate"?: number; Empty?: unknown; [key: string]: unknown };
                        content: { "application/json": User };
                    };
                    default: { headers: { [key: string]: unknown }; content: { "text/plain": unknown } };
                }`,
            }
        );
    });

    test('a request body or header content without a schema is unknown', () => {
        expectOperations(
            document({
                '/raw': {
                    post: {
                        operationId: 'raw',
                        requestBody: { required: true },
                        responses: {
                            200: {
                                description: 'Raw',
                                headers: {
                                    A: { content: {} },
                                    B: { content: { 'text/plain': {} } },
                                },
                            },
                        },
                    },
                },
            }),
            {
                'G.Operations["raw"]["requestBody"]': '{ content?: never }',
                'G.Operations["raw"]["responses"][200]["headers"]':
                    '{ A?: unknown; B?: unknown; [key: string]: unknown }',
            }
        );
    });

    test('a path item reference', () => {
        expectOperations(
            {
                ...(document({ '/a': { $ref: '#/x-paths/a' } }) as object),
                'x-paths': { a: { get: { operationId: 'a', responses: {} } } },
            },
            { 'G.Paths["/a"]["get"]': 'G.Operations["a"]' }
        );
    });

    test('documentation', () => {
        const source = genever(
            document({
                '/a': {
                    get: {
                        operationId: 'a',
                        summary: 'Get A',
                        description: 'All of it',
                        deprecated: true,
                        responses: {},
                    },
                },
            })
        );

        expect(source).to.contain('Get A').and.to.contain('@deprecated');
    });

    suite('generic types keyed by operationId', () => {
        const helpers = document({
            '/users/{id}': {
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                ],
                get: {
                    operationId: 'getUser',
                    parameters: [{ name: 'fields', in: 'query', schema: { type: 'string' } }],
                    responses: { 200: jsonUser, 404: { description: 'Missing' } },
                },
                put: {
                    operationId: 'putUser',
                    requestBody: { required: true, ...jsonUser },
                    responses: { default: { description: 'Error', content: { 'text/plain': {} } } },
                },
                patch: { operationId: 'patchUser', requestBody: jsonUser, responses: {} },
            },
            '/health': { get: { operationId: 'health', responses: {} } },
        });

        test('what a call sends: parameters by location, and the JSON body, each if it has them', () => {
            expectOperations(helpers, {
                'G.OperationInput<"getUser">':
                    '{ readonly path: { id: string } } & { readonly query?: { fields?: string } }',
                'G.OperationInput<"putUser">':
                    '{ readonly body: User } & { readonly path: { id: string } }',
                'G.OperationInput<"patchUser">':
                    '{ readonly body?: User } & { readonly path: { id: string } }',
                'G.OperationInput<"health">': 'unknown',
            });
        });

        test('every response, as status and JSON body', () => {
            expectOperations(helpers, {
                'G.OperationResult<"getUser">':
                    '{ readonly status: 200; readonly body: User } | { readonly status: 404; readonly body: undefined }',
                'G.OperationResult<"putUser">':
                    '{ readonly status: number; readonly body: undefined }',
            });
        });

        test('a misspelled operationId is a type error', () => {
            const source = genever(helpers);

            expect(
                typeCheck({
                    'generated.ts': source,
                    'use.ts':
                        "import type { OperationInput } from './generated.js';\nexport type Input = OperationInput<'getUsers'>;",
                })
            ).to.have.length(1);
        });

        test('a component named OperationInput keeps its name', () => {
            const source = genever(
                document(
                    { '/health': { get: { operationId: 'health', responses: {} } } },
                    { schemas: { OperationInput: { type: 'string' } } }
                )
            );

            expect(typeCheck({ 'generated.ts': source })).to.deep.equal([]);
            expect(source)
                .to.contain('export type OperationInput = string')
                .and.to.contain('OperationInput2');
        });
    });

    test('no paths, no operation types', () => {
        expect(genever(document({}))).to.contain('export type Paths');
        expect(
            genever({ openapi: '3.1.0', info: { title: 'API', version: '1.0.0' } })
        ).not.to.contain('Paths');
    });

    test('a component named Paths keeps its name', () => {
        const source = genever({
            openapi: '3.1.0',
            info: { title: 'API', version: '1.0.0' },
            paths: {},
            components: { schemas: { Paths: { type: 'string' } } },
        });

        expect(typeCheck({ 'generated.ts': source })).to.deep.equal([]);
        expect(source).to.contain('export type Paths = string').and.to.contain('Paths2');
    });

    suite('invalid', () => {
        test('operationId used twice', () => {
            expect(() =>
                genever(
                    document({
                        '/a': { get: { operationId: 'x', responses: {} } },
                        '/b': { get: { operationId: 'x', responses: {} } },
                    })
                )
            ).to.throw(GeneverInvalidSchemaError, 'operationId "x"');
        });

        test('parameters is not an array', () => {
            expect(() =>
                genever(document({ '/a': { get: { parameters: {}, responses: {} } } }))
            ).to.throw(GeneverInvalidSchemaError, 'parameters must be an array');
        });

        test('a parameter without a location', () => {
            expect(() =>
                genever(
                    document({
                        '/a': { get: { parameters: [{ name: 'a', in: 'body' }], responses: {} } },
                    })
                )
            ).to.throw(GeneverInvalidSchemaError, 'A parameter needs a name');
        });

        test('paths is not an object', () => {
            expect(() => genever({ ...(document({}) as object), paths: [] })).to.throw(
                GeneverInvalidSchemaError
            );
        });
    });
});

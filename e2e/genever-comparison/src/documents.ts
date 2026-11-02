const mixedNumber = 42;

const circle = {
    type: 'object',
    properties: {
        kind: { const: 'circle' },
        radius: { type: 'number' },
    },
    required: ['kind', 'radius'],
    additionalProperties: false,
} as const;

const square = {
    type: 'object',
    properties: {
        kind: { const: 'square' },
        side: { type: 'number' },
    },
    required: ['kind', 'side'],
    additionalProperties: false,
} as const;

/**
 * Every feature the JSON Schema probes read. Each root property is optional, so a probe can give only the one it is
 * about.
 */
export const jsonSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    $defs: {
        tree: {
            type: 'object',
            properties: {
                value: { type: 'number' },
                children: { type: 'array', items: { $ref: '#/$defs/tree' } },
            },
            required: ['value'],
            additionalProperties: false,
        },
    },
    properties: {
        nullable: { type: ['string', 'null'] },
        mixed: { enum: ['a', mixedNumber, null] },
        point: {
            type: 'array',
            prefixItems: [{ type: 'number' }, { type: 'number' }],
            items: false,
            minItems: 2,
        },
        shape: { oneOf: [circle, square] },
        tree: { $ref: '#/$defs/tree' },
        headers: {
            type: 'object',
            patternProperties: { '^x-': { type: 'string' } },
            additionalProperties: false,
        },
        id: { type: 'string', pattern: '^usr_' },
        billing: {
            type: 'object',
            properties: {
                card: { type: 'string' },
                address: { type: 'string' },
            },
            dependentRequired: { card: ['address'] },
            additionalProperties: false,
        },
    },
    additionalProperties: false,
} as const;

/**
 * Every feature the OpenAPI probes read.
 */
export const openApiDocument = {
    openapi: '3.1.0',
    info: { title: 'Notes', version: '1.0.0' },
    paths: {
        '/notes/{id}': {
            put: {
                operationId: 'putNote',
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'dryRun', in: 'query', schema: { type: 'boolean' } },
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': { schema: { $ref: '#/components/schemas/Note' } },
                    },
                },
                responses: {
                    '200': {
                        description: 'Saved',
                        content: {
                            'application/json': { schema: { $ref: '#/components/schemas/Note' } },
                        },
                    },
                },
            },
        },
    },
    components: {
        schemas: {
            Note: {
                type: 'object',
                properties: {
                    id: { type: 'string', pattern: '^note_' },
                    position: {
                        type: 'array',
                        prefixItems: [{ type: 'number' }, { type: 'number' }],
                        items: false,
                        minItems: 2,
                    },
                    status: { enum: ['open', 1, null] },
                },
                required: ['id'],
                additionalProperties: false,
            },
        },
    },
} as const;

const thing = (extra: object = {}): object => ({
    type: 'object',
    properties: {
        id: { type: 'string', pattern: '^id_' },
        count: { type: 'integer' },
        status: { enum: ['a', 'b', 'c'] },
        tags: { type: 'array', items: { type: 'string' } },
        ...extra,
    },
    required: ['id'],
    additionalProperties: false,
});

const names = (count: number, prefix: string): string[] =>
    Array.from({ length: count }, (_, index) => `${prefix}${index}`);

/**
 * A JSON Schema of many definitions, each used by a root property, to time generating from something the size of a real
 * API's schemas. They are wide rather than a deep chain of references, which real schemas aren't.
 *
 * @param count - definitions to generate
 * @returns JSON Schema with that many definitions
 */
export const largeJsonSchema = (count: number): object => ({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: Object.fromEntries(
        names(count, 'Def').map(name => [name, { $ref: `#/$defs/${name}` }])
    ),
    additionalProperties: false,
    $defs: {
        Shared: thing(),
        ...Object.fromEntries(
            names(count, 'Def').map(name => [name, thing({ shared: { $ref: '#/$defs/Shared' } })])
        ),
    },
});

/**
 * An OpenAPI document with one path per schema, as a large API would have.
 *
 * @param count - paths to generate
 * @returns OpenAPI document with that many paths
 */
export const largeOpenApiDocument = (count: number): object => ({
    openapi: '3.1.0',
    info: { title: 'Large', version: '1.0.0' },
    paths: Object.fromEntries(
        names(count, 'Thing').map(name => [
            ['', name, '{id}'].join('/'),
            {
                get: {
                    operationId: `get${name}`,
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                    ],
                    responses: {
                        '200': {
                            description: 'Found',
                            content: {
                                'application/json': {
                                    schema: { $ref: `#/components/schemas/${name}` },
                                },
                            },
                        },
                    },
                },
            },
        ])
    ),
    components: {
        schemas: Object.fromEntries(names(count, 'Thing').map(name => [name, thing()])),
    },
});

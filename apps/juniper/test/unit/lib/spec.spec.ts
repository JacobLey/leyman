import type { JsonSchema, OpenApi30JsonSchema, SchemaType } from 'juniper';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import { numberSchema, objectSchema, serializeSpec, stringSchema } from 'juniper';
import { suite, test } from 'mocha-chain';

const user = objectSchema({
    properties: { id: numberSchema(), name: stringSchema().nullable() },
    required: ['id'],
}).define('User');
const team = objectSchema({ properties: { owner: user } }).define('Team');

const content = (schema: unknown) => ({ 'application/json': { schema } });

suite('serializeSpec', () => {
    test('OpenAPI 3.1', () => {
        const spec = serializeSpec({
            openapi: '3.1.0',
            info: { title: 'API', version: '1.0.0' },
            paths: {
                '/team': {
                    get: { responses: { 200: { description: 'Team', content: content(team) } } },
                },
            },
        });

        expect(spec).to.deep.equal({
            openapi: '3.1.0',
            info: { title: 'API', version: '1.0.0' },
            paths: {
                '/team': {
                    get: {
                        responses: {
                            200: {
                                description: 'Team',
                                content: content({ $ref: '#/components/schemas/Team' }),
                            },
                        },
                    },
                },
            },
            components: {
                schemas: {
                    Team: {
                        type: 'object',
                        properties: { owner: { $ref: '#/components/schemas/User' } },
                    },
                    User: {
                        type: 'object',
                        properties: {
                            id: { type: 'number' },
                            name: { type: ['string', 'null'] },
                        },
                        required: ['id'],
                    },
                },
            },
        });
        expectTypeOf(spec.components.schemas).toEqualTypeOf<Record<string, JsonSchema<unknown>>>();
    });

    test('OpenAPI 3.0', () => {
        const spec = serializeSpec({ openapi: '3.0.3', schemas: [user, stringSchema()] });

        expect(spec.schemas).to.deep.equal([
            { $ref: '#/components/schemas/User' },
            { type: 'string' },
        ]);
        expect(spec.components.schemas.User).to.have.nested.property(
            'properties.name.nullable',
            true
        );
        expectTypeOf(spec.schemas[1]).toEqualTypeOf<OpenApi30JsonSchema<string>>();
        expectTypeOf(spec.components.schemas).toEqualTypeOf<
            Record<string, OpenApi30JsonSchema<unknown>>
        >();
    });

    test('Options override the version', () => {
        const spec = serializeSpec({ openapi: '3.1.0', schema: user }, { openApi30: true });

        expect(spec.components.schemas.User).to.have.nested.property(
            'properties.name.nullable',
            true
        );
        expectTypeOf(spec.schema).toEqualTypeOf<OpenApi30JsonSchema<SchemaType<typeof user>>>();
    });

    test('Options choose the reference path', () => {
        const spec = serializeSpec(
            { schema: user, components: { schemas: { User: user } } },
            { definitionsPath: '#/definitions/' }
        );

        expect(spec.schema).to.deep.equal({ $ref: '#/definitions/User' });
        expect(spec.components.schemas.User).to.have.property('type', 'object');
    });

    test('Without a version, references components', () => {
        const spec = serializeSpec({ schema: user });

        expect(spec.schema).to.deep.equal({ $ref: '#/components/schemas/User' });
        expect(spec.components.schemas).to.have.keys('User');
    });

    test('A defined schema under its own name is its definition', () => {
        const spec = serializeSpec({ openapi: '3.1.0', components: { schemas: { User: user } } });

        expect(spec.components.schemas.User).to.have.property('type', 'object');
    });

    test('Keeps other components', () => {
        const spec = serializeSpec({
            openapi: '3.1.0',
            components: {
                schemas: { Zone: { type: 'string' }, Name: stringSchema(), User: user },
                securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
            },
        });

        expect(spec.components).to.deep.equal({
            schemas: {
                Name: { type: 'string' },
                User: spec.components.schemas.User,
                Zone: { type: 'string' },
            },
            securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
        });
        // Sorted by name
        expect(Object.keys(spec.components.schemas)).to.deep.equal(['Name', 'User', 'Zone']);
    });

    test('Keeps an identical component', () => {
        const definition = serializeSpec({ schema: user }).components.schemas.User;

        const spec = serializeSpec({ schema: user, components: { schemas: { User: definition } } });

        expect(spec.components.schemas.User).to.deep.equal(definition);
    });

    test('Rejects a different component with a definition name', () => {
        expect(() =>
            serializeSpec({ schema: user, components: { schemas: { User: { type: 'string' } } } })
        ).to.throw(Error, 'User');
    });

    test('Does not modify the document', () => {
        const document = { openapi: '3.1.0', paths: { schema: user } };

        serializeSpec(document);

        expect(document.paths.schema).to.equal(user);
    });
});

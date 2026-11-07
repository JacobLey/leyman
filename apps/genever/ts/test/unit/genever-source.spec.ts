import type { Context } from 'mocha';
import { expect } from '@leyman/expect';
import { genever, geneverSource } from 'genever';
import { suite, test } from 'mocha-chain';

/**
 * Each name `geneverSource` lists, with the source at its `start`.
 *
 * @param schema - schema or OpenAPI document
 * @returns name, pointer, and the source's text where the name should be
 */
const namesOf = (schema: unknown): { name: string; pointer: string; at: string }[] => {
    const { names, text } = geneverSource(schema);
    return names.map(({ name, pointer, start }) => ({
        name,
        pointer,
        at: text.slice(start, start + name.length),
    }));
};

suite('geneverSource', () => {
    test('the same source as genever', () => {
        const schema = { type: 'object', properties: { id: { type: 'string' } } };

        expect(geneverSource(schema, { name: 'User' }).text).to.equal(
            genever(schema, { name: 'User' })
        );
    });

    test('the root, each definition and each referenced schema', () => {
        expect(
            namesOf({
                type: 'object',
                properties: { a: { $ref: '#/properties/b' }, b: { type: 'string' } },
                $defs: { Note: { type: 'string' } },
            })
        ).to.deep.equal([
            { name: 'Schema', pointer: '#', at: 'Schema' },
            { name: 'a', pointer: '#/properties/a', at: 'a' },
            { name: 'b', pointer: '#/properties/b', at: 'b' },
            { name: 'Note', pointer: '#/$defs/Note', at: 'Note' },
            { name: 'PropertiesB', pointer: '#/properties/b', at: 'PropertiesB' },
        ]);
    });

    test('each property, nested, optional or quoted', () => {
        expect(
            namesOf({
                type: 'object',
                properties: {
                    'a b': { type: 'string' },
                    c: { type: 'object', properties: { d: { type: 'number' } }, required: ['d'] },
                },
            })
        ).to.deep.equal([
            { name: 'Schema', pointer: '#', at: 'Schema' },
            { name: '"a b"', pointer: '#/properties/a b', at: '"a b"' },
            { name: 'c', pointer: '#/properties/c', at: 'c' },
            { name: 'd', pointer: '#/properties/c/properties/d', at: 'd' },
        ]);
    });

    test('a property merged from allOf members is the first to declare it', () => {
        expect(
            namesOf({
                type: 'object',
                allOf: [
                    { properties: { a: { type: 'string' } }, required: ['a'] },
                    { properties: { a: { type: 'string', minLength: 1 }, b: { type: 'number' } } },
                ],
            })
        ).to.deep.equal([
            { name: 'Schema', pointer: '#', at: 'Schema' },
            { name: 'a', pointer: '#/allOf/0/properties/a', at: 'a' },
            { name: 'b', pointer: '#/allOf/1/properties/b', at: 'b' },
        ]);
    });

    test("a property the schema and its allOf members declare is the schema's own", () => {
        const names = namesOf({
            type: 'object',
            allOf: [{ properties: { a: { type: 'string', minLength: 1 } } }],
            properties: { a: { type: 'string' } },
        });

        expect(names).to.deep.include({ name: 'a', pointer: '#/properties/a', at: 'a' });
    });

    test('an object with more properties than a call has room for arguments', function (this: Context) {
        // About 150,000 arguments overflow Node's default stack
        this.timeout(20_000);
        const count = 200_000;
        const properties = Object.fromEntries(
            Array.from({ length: count }, (_, i) => [`p${i}`, { type: 'string' }])
        );

        expect(namesOf({ type: 'object', properties })).to.have.length(count + 1);
    });

    test('a pattern matching one key, but not a property only required', () => {
        expect(
            namesOf({
                type: 'object',
                patternProperties: { '^a$': { type: 'string' } },
                allOf: [{ required: ['b'] }],
                properties: { b: { type: 'number' } },
            })
        ).to.deep.equal([
            { name: 'Schema', pointer: '#', at: 'Schema' },
            { name: 'b', pointer: '#/properties/b', at: 'b' },
            { name: 'a', pointer: '#/patternProperties/^a$', at: 'a' },
        ]);
    });

    test("each component, and Paths, but not an OpenAPI document's helpers", () => {
        expect(
            namesOf({
                openapi: '3.1.0',
                info: { title: 'Notes', version: '1' },
                paths: {
                    '/notes': {
                        get: {
                            operationId: 'listNotes',
                            responses: { 204: { description: 'None' } },
                        },
                    },
                },
                components: { schemas: { 'A note': { type: 'string' } } },
            })
        ).to.deep.equal([
            { name: 'ANote', pointer: '#/components/schemas/A note', at: 'ANote' },
            { name: 'Paths', pointer: '#/paths', at: 'Paths' },
        ]);
    });
});

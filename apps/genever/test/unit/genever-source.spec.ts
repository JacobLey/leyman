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
            { name: 'Note', pointer: '#/$defs/Note', at: 'Note' },
            { name: 'PropertiesB', pointer: '#/properties/b', at: 'PropertiesB' },
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

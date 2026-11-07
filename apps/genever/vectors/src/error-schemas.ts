/**
 * A schema genever must reject, and the JSON Pointer to the schema or keyword at fault.
 */
export interface ErrorCase {
    readonly schema: unknown;
    /**
     * Read the schema as OpenAPI 3.0, or turn off strict mode. Both default to `false`, as genever's own options do
     * for OpenAPI 3.0, and unlike strict mode, which genever turns on by default.
     */
    readonly options?: { readonly openApi30?: boolean; readonly strict?: boolean };
    readonly pointer: string;
}

/**
 * Schemas that are not valid JSON Schema.
 */
export const invalidSchemas: Readonly<Record<string, ErrorCase>> = {
    'schema is not an object': { schema: { type: 'array', items: 'string' }, pointer: '#/items' },
    'schema is an array': { schema: [], pointer: '#' },
    'type is empty': { schema: { type: [] }, pointer: '#/type' },
    'type is unknown': { schema: { type: 'date' }, pointer: '#/type' },
    'enum is not an array': { schema: { enum: 'a' }, pointer: '#/enum' },
    'allOf is empty': { schema: { allOf: [] }, pointer: '#/allOf' },
    'anyOf is not an array': { schema: { anyOf: {} }, pointer: '#/anyOf' },
    'properties is not an object': {
        schema: { type: 'object', properties: [] },
        pointer: '#/properties',
    },
    'required is not strings': { schema: { type: 'object', required: [1] }, pointer: '#/required' },
    'required is not an array': {
        schema: { type: 'object', required: 'a' },
        pointer: '#/required',
    },
    'patternProperties is not an object': {
        schema: { type: 'object', patternProperties: true },
        pointer: '#/patternProperties',
    },
    'pattern is not a string': { schema: { type: 'string', pattern: 1 }, pointer: '#/pattern' },
    'pattern is not a regular expression': {
        schema: { type: 'string', pattern: '(' },
        pointer: '#/pattern',
    },
    'property pattern is not a regular expression': {
        schema: { type: 'object', patternProperties: { '(': true } },
        pointer: '#/patternProperties/(',
    },
    'minItems is negative': { schema: { type: 'array', minItems: -1 }, pointer: '#/minItems' },
    'minItems is not an integer': {
        schema: { type: 'array', minItems: 1.5 },
        pointer: '#/minItems',
    },
    '$ref is not a string': { schema: { $ref: 1 }, pointer: '#/$ref' },
    '$ref does not resolve': { schema: { $ref: '#/$defs/Missing' }, pointer: '#/$ref' },
    '$ref through a primitive': {
        schema: { $ref: '#/type/foo', type: 'string' },
        pointer: '#/$ref',
    },
    '$ref is not encoded': { schema: { $ref: '#/%E0%A4%A' }, pointer: '#/$ref' },
    '$ref is not a URI': { schema: { $ref: 'https://[' }, pointer: '#/$ref' },
    '$ref names a missing anchor': { schema: { $ref: '#missing' }, pointer: '#/$ref' },
    '$ref through aliases to itself': {
        schema: {
            $ref: 'a.json',
            $defs: { A: { $id: 'a.json', $ref: 'b.json' }, B: { $id: 'b.json', $ref: 'a.json' } },
        },
        pointer: '#/$ref',
    },
    '$id is not a string': { schema: { $id: 1 }, pointer: '#/$id' },
    '$id has a fragment': {
        schema: { $defs: { A: { $id: 'a.json#b' } } },
        pointer: '#/$defs/A/$id',
    },
    '$id is not a URI': {
        schema: { $defs: { A: { $id: 'https://[' } } },
        pointer: '#/$defs/A/$id',
    },
    '$id declared twice': {
        schema: { $defs: { A: { $id: 'a.json' }, B: { $id: 'a.json' } } },
        pointer: '#/$defs/B/$id',
    },
    'anchor declared twice': {
        schema: { $defs: { A: { $anchor: 'a' }, B: { $anchor: 'a' } } },
        pointer: '#/$defs/B/$anchor',
    },
    'anchor is not a name': {
        schema: { $defs: { A: { $anchor: '1a' } } },
        pointer: '#/$defs/A/$anchor',
    },
    'anchor is not a string': {
        schema: { $defs: { A: { $anchor: 1 } } },
        pointer: '#/$defs/A/$anchor',
    },
    '$defs is not an object': { schema: { $defs: [] }, pointer: '#/$defs' },
    'dependentRequired is not an object': {
        schema: { type: 'object', dependentRequired: [] },
        pointer: '#/dependentRequired',
    },
    'nullable is not a boolean': {
        options: { openApi30: true },
        schema: { type: 'string', nullable: 'yes' },
        pointer: '#/nullable',
    },
    'minLength is not an integer': {
        schema: { type: 'string', minLength: 'a' },
        pointer: '#/minLength',
    },
    'maxItems is negative': { schema: { type: 'array', maxItems: -1 }, pointer: '#/maxItems' },
    'minimum is not a number': { schema: { type: 'number', minimum: '1' }, pointer: '#/minimum' },
    'exclusiveMaximum is not a number or boolean': {
        options: { openApi30: true },
        schema: { type: 'number', exclusiveMaximum: '1' },
        pointer: '#/exclusiveMaximum',
    },
};

/**
 * Valid schemas strict mode rejects as most likely a mistake. Each is accepted with strict mode off.
 */
export const strictSchemas: Readonly<Record<string, ErrorCase>> = {
    'unknown keyword': { schema: { type: 'string', foo: 1 }, pointer: '#/foo' },
    'OpenAPI 3.0 keyword': { schema: { type: 'string', nullable: true }, pointer: '#/nullable' },
    'type keyword without a type': { schema: { maxLength: 1 }, pointer: '#/maxLength' },
    'keyword for another type': {
        schema: { type: 'number', maxLength: 1 },
        pointer: '#/maxLength',
    },
    'required property not declared': {
        schema: { type: 'object', properties: { a: true }, required: ['b'] },
        pointer: '#/required',
    },
    'then without if': { schema: { type: 'string', then: { maxLength: 1 } }, pointer: '#/then' },
    'else without if': { schema: { type: 'string', else: { maxLength: 1 } }, pointer: '#/else' },
    'enum value of another type': { schema: { type: 'string', enum: ['a', 1] }, pointer: '#' },
    'const of another type': { schema: { type: 'integer', const: 1.5 }, pointer: '#' },
    'minLength greater than maxLength': {
        schema: { type: 'string', minLength: 3, maxLength: 2 },
        pointer: '#',
    },
    'minimum greater than maximum': {
        schema: { type: 'number', minimum: 3, maximum: 2 },
        pointer: '#',
    },
    'minItems greater than maxItems': {
        schema: { type: 'array', minItems: 3, maxItems: 2 },
        pointer: '#',
    },
    'maxItems less than prefixItems': {
        schema: { type: 'array', prefixItems: [true, true], maxItems: 1 },
        pointer: '#',
    },
    'required property that is never valid': {
        schema: { type: 'object', properties: { a: false }, required: ['a'] },
        pointer: '#',
    },
};

/**
 * Valid schemas using a feature genever can't generate types for.
 */
export const unsupportedSchemas: Readonly<Record<string, ErrorCase>> = {
    '$ref to another document': { schema: { $ref: 'other.json#/$defs/A' }, pointer: '#/$ref' },
    $dynamicRef: {
        options: { strict: false },
        schema: { $dynamicRef: '#node' },
        pointer: '#/$dynamicRef',
    },
};

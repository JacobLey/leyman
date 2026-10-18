/**
 * Value of the JSON Schema `type` keyword.
 */
export type JsonType = 'array' | 'boolean' | 'integer' | 'null' | 'number' | 'object' | 'string';

export const jsonTypes: ReadonlySet<string> = new Set<JsonType>([
    'array',
    'boolean',
    'integer',
    'null',
    'number',
    'object',
    'string',
]);

/**
 * Keywords that only apply to values of one type, e.g. `maxLength` only constrains strings.
 * `integer` shares the keywords of `number`.
 */
export const typeKeywords: ReadonlyMap<string, 'array' | 'number' | 'object' | 'string'> = new Map([
    // String
    ['contentEncoding', 'string'],
    ['contentMediaType', 'string'],
    ['contentSchema', 'string'],
    ['format', 'string'],
    ['maxLength', 'string'],
    ['minLength', 'string'],
    ['pattern', 'string'],
    // Number
    ['exclusiveMaximum', 'number'],
    ['exclusiveMinimum', 'number'],
    ['maximum', 'number'],
    ['minimum', 'number'],
    ['multipleOf', 'number'],
    // Object
    ['additionalProperties', 'object'],
    ['dependencies', 'object'],
    ['dependentRequired', 'object'],
    ['dependentSchemas', 'object'],
    ['maxProperties', 'object'],
    ['minProperties', 'object'],
    ['patternProperties', 'object'],
    ['properties', 'object'],
    ['propertyNames', 'object'],
    ['required', 'object'],
    ['unevaluatedProperties', 'object'],
    // Array
    ['additionalItems', 'array'],
    ['contains', 'array'],
    ['items', 'array'],
    ['maxContains', 'array'],
    ['maxItems', 'array'],
    ['minContains', 'array'],
    ['minItems', 'array'],
    ['prefixItems', 'array'],
    ['unevaluatedItems', 'array'],
    ['uniqueItems', 'array'],
] as const);

/**
 * Keywords that apply to values of any type.
 */
export const genericKeywords: ReadonlySet<string> = new Set([
    // Core
    '$anchor',
    '$comment',
    '$defs',
    '$dynamicAnchor',
    '$id',
    '$recursiveAnchor',
    '$ref',
    '$schema',
    '$vocabulary',
    'definitions',
    // Annotations
    'default',
    'deprecated',
    'description',
    'examples',
    'readOnly',
    'title',
    'writeOnly',
    // Validation
    'const',
    'enum',
    'type',
    // Composition
    'allOf',
    'anyOf',
    'else',
    'if',
    'not',
    'oneOf',
    'then',
]);

/**
 * Keywords whose effect decant can't generate types for. They always fail, even outside strict mode,
 * as ignoring them would loosen the type.
 */
export const unsupportedKeywords: ReadonlySet<string> = new Set(['$dynamicRef', '$recursiveRef']);

/**
 * Keywords only allowed with the OpenAPI 3.0 dialect.
 */
export const openApi30Keywords: ReadonlySet<string> = new Set(['example', 'nullable']);

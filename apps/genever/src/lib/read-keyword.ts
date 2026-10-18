import type { JsonType } from './keywords.js';
import type { TsDoc, TsType } from './ts-type.js';
import { GeneverInvalidSchemaError } from './errors.js';
import { jsonTypes } from './keywords.js';
import { childPointer } from './pointer.js';
import { nullType } from './ts-type.js';

export type SchemaObject = Readonly<Record<string, unknown>>;

/**
 * Whether a value is a JSON object (not an array or `null`).
 *
 * @param value - schema, or the value of a keyword
 * @returns true if the value is an object
 */
export const isSchemaObject = (value: unknown): value is SchemaObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Read a keyword whose value must be an object, such as `properties`.
 *
 * @param value - value of the keyword, or a schema
 * @param pointer - JSON Pointer to the keyword
 * @returns the value, known to be a JSON object
 * @throws {GeneverInvalidSchemaError} if the value is not an object
 */
export const readObject = (value: unknown, pointer: string): SchemaObject => {
    if (!isSchemaObject(value)) {
        throw new GeneverInvalidSchemaError('Must be an object', { pointer });
    }
    return value;
};

/**
 * Read a keyword whose value must be a non-empty array of schemas, such as `allOf`.
 *
 * @param value - keyword value
 * @param pointer - JSON Pointer to the keyword
 * @returns the schemas, each still to be validated
 * @throws {GeneverInvalidSchemaError} if the value is not a non-empty array
 */
export const readSchemaArray = (value: unknown, pointer: string): readonly unknown[] => {
    if (!Array.isArray(value) || value.length === 0) {
        throw new GeneverInvalidSchemaError('Must be a non-empty array of schemas', { pointer });
    }
    return value;
};

/**
 * Read a keyword whose value must be an array of property names, such as `required`.
 *
 * @param value - keyword value, or `undefined` if absent
 * @param pointer - JSON Pointer to the keyword
 * @returns property names, empty if absent
 * @throws {GeneverInvalidSchemaError} if the value is not an array of strings
 */
export const readPropertyNames = (value: unknown, pointer: string): readonly string[] => {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value) || value.some(name => typeof name !== 'string')) {
        throw new GeneverInvalidSchemaError('Must be an array of strings', { pointer });
    }
    return value as string[];
};

/**
 * Read a keyword that counts something, such as `minLength` or `maxItems`.
 *
 * @param value - value of the keyword, or `undefined` if absent
 * @param pointer - JSON Pointer to the keyword
 * @returns the count, or `null` if absent
 * @throws {GeneverInvalidSchemaError} if the value is not a non-negative integer
 */
export const readCount = (value: unknown, pointer: string): number | null => {
    if (value === undefined) {
        return null;
    }
    // Not `Number.isSafeInteger`: Juniper writes an unlimited count as `1e308`
    if (typeof value !== 'number' || value < 0 || value % 1 !== 0) {
        throw new GeneverInvalidSchemaError('Must be a non-negative integer', { pointer });
    }
    return value;
};

/**
 * Read a keyword that bounds a number, such as `minimum`.
 *
 * @param value - value of the keyword, or `undefined` if absent
 * @param pointer - JSON Pointer to the keyword
 * @param isBooleanAllowed - accept a boolean, as OpenAPI 3.0's `exclusiveMinimum` and `exclusiveMaximum` are
 * @returns the bound (or boolean), or `null` if absent
 * @throws {GeneverInvalidSchemaError} if the value is not a finite number (or boolean, when allowed)
 */
export const readBound = (
    value: unknown,
    pointer: string,
    isBooleanAllowed: boolean
): boolean | number | null => {
    if (value === undefined) {
        return null;
    }
    if ((isBooleanAllowed && typeof value === 'boolean') || Number.isFinite(value)) {
        return value as boolean | number;
    }
    throw new GeneverInvalidSchemaError(
        isBooleanAllowed ? 'Must be a number or boolean' : 'Must be a number',
        { pointer }
    );
};

/**
 * Read the `type` keyword.
 *
 * @param value - value of `type`, or `undefined` if absent
 * @param pointer - JSON Pointer to the schema
 * @returns declared types, or `null` if there is no `type`
 * @throws {GeneverInvalidSchemaError} if the value is not a type, or a non-empty array of types
 */
export const readTypes = (value: unknown, pointer: string): JsonType[] | null => {
    if (value === undefined) {
        return null;
    }
    const types: unknown[] = Array.isArray(value) ? value : [value];
    if (types.length === 0 || types.some(type => !jsonTypes.has(type as string))) {
        const allowed = [...jsonTypes].join(', ');
        throw new GeneverInvalidSchemaError(`type must be one of, or an array of, ${allowed}`, {
            pointer: childPointer(pointer, 'type'),
        });
    }
    return types as JsonType[];
};

/**
 * Read a regular expression, such as `pattern` or a key of `patternProperties`.
 *
 * @param value - regular expression source
 * @param pointer - JSON Pointer to the keyword
 * @returns the regular expression source
 * @throws {GeneverInvalidSchemaError} if the value is not a valid regular expression
 */
export const readPattern = (value: unknown, pointer: string): string => {
    if (typeof value !== 'string') {
        throw new GeneverInvalidSchemaError('pattern must be a string', { pointer });
    }
    try {
        // eslint-disable-next-line no-new
        new RegExp(value, 'u');
    } catch {
        throw new GeneverInvalidSchemaError(`Invalid regular expression "${value}"`, { pointer });
    }
    return value;
};

/**
 * Keywords documented as JSDoc tags: annotations, and constraints TypeScript can't express.
 */
const documentedKeywords = [
    'format',
    'minLength',
    'maxLength',
    'pattern',
    'minimum',
    'exclusiveMinimum',
    'maximum',
    'exclusiveMaximum',
    'multipleOf',
    'minItems',
    'maxItems',
    'uniqueItems',
    'minProperties',
    'maxProperties',
    'default',
] as const;

/**
 * OpenAPI's single `example`, if any.
 *
 * @param schema - schema that may have an `example`
 * @returns the example, in an array, or nothing
 */
const exampleOf = (schema: SchemaObject): unknown[] =>
    Object.hasOwn(schema, 'example') ? [schema.example] : [];

/**
 * Read the annotations of a schema that document its type.
 * Annotations of the wrong type are ignored, as they don't change what the schema accepts.
 *
 * @param schema - any schema
 * @returns title, description, deprecation and JSDoc tags, or `null` if there are none
 */
export const readDoc = (schema: unknown): TsDoc | null => {
    if (!isSchemaObject(schema)) {
        return null;
    }
    const { deprecated, description, examples, title } = schema;
    const exampleValues: unknown[] = [
        ...(Array.isArray(examples) ? (examples as unknown[]) : []),
        ...exampleOf(schema),
    ];
    const tags = [
        ...documentedKeywords.flatMap(keyword =>
            schema[keyword] === undefined
                ? []
                : { name: keyword, text: JSON.stringify(schema[keyword]) }
        ),
        ...exampleValues.map(example => ({ name: 'example', text: JSON.stringify(example) })),
    ];
    const doc: TsDoc = {
        tags,
        deprecated: deprecated === true,
        description: typeof description === 'string' ? description : null,
        title: typeof title === 'string' ? title : null,
    };
    return doc.deprecated || doc.description || doc.title || tags.length > 0 ? doc : null;
};

/**
 * Type of exactly one JSON value, as used by `enum` and `const`.
 *
 * @param value - an allowed value
 * @returns literal type of the value
 */
export const jsonLiteral = (value: unknown): TsType => {
    if (value === null) {
        return nullType;
    }
    if (Array.isArray(value)) {
        return {
            kind: 'tuple',
            elements: value.map(element => ({ optional: false, type: jsonLiteral(element) })),
            rest: null,
        };
    }
    if (typeof value === 'object') {
        return {
            kind: 'object',
            index: [],
            properties: Object.entries(value).map(([name, property]) => ({
                name,
                doc: null,
                optional: false,
                type: jsonLiteral(property),
            })),
        };
    }
    return { kind: 'literal', value: value as boolean | number | string };
};

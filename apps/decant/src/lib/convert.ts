import type { JsonType } from './keywords.js';
import type { SchemaObject } from './read-keyword.js';
import type { TsDoc, TsIndex, TsProperty, TsType } from './ts-type.js';
import {
    DecantInvalidSchemaError,
    DecantStrictModeError,
    DecantUnsupportedError,
} from './errors.js';
import {
    genericKeywords,
    openApi30Keywords,
    typeKeywords,
    unsupportedKeywords,
} from './keywords.js';
import { TypeNames } from './names.js';
import { patternType } from './pattern.js';
import { childPointer, resolveRef } from './pointer.js';
import {
    isSchemaObject,
    jsonLiteral,
    readBound,
    readCount,
    readDoc,
    readObject,
    readPattern,
    readPropertyNames,
    readSchemaArray,
    readTypes,
} from './read-keyword.js';
import {
    booleanType,
    exclude,
    intersection,
    neverType,
    nullType,
    numberType,
    objectType,
    stringType,
    union,
    unknownType,
} from './ts-type.js';

export interface ConvertOptions {
    /**
     * Read OpenAPI 3.0 keywords, such as `nullable`.
     */
    readonly openApi30: boolean;
    /**
     * Fail on schemas that are valid, but likely mistakes. See the README for the rules.
     */
    readonly strict: boolean;
}

/**
 * A type to generate, with its name.
 */
export interface NamedType {
    readonly doc: TsDoc | null;
    readonly name: string;
    readonly type: TsType;
}

/**
 * Context a subschema inherits from the schema it is applied with, e.g. the members of `allOf`.
 */
interface Scope {
    /**
     * Types of the properties declared by this schema and its parents, for keywords that name a property
     * without declaring it, e.g. `required` in a `then`.
     */
    readonly properties: ReadonlyMap<string, TsType>;
    /**
     * Types of the parent schema. Type specific keywords without a `type` of their own apply to these.
     */
    readonly types: readonly JsonType[] | null;
}

const emptyScope: Scope = { properties: new Map(), types: null };

/**
 * JSON Pointers of the objects whose keys name definitions. A definition's type is named after its key.
 */
const definitionContainers = new Set(['#/$defs', '#/definitions', '#/components/schemas']);

/**
 * Types without keywords that narrow them.
 */
const primitiveTypes: Readonly<Partial<Record<JsonType, TsType>>> = {
    boolean: booleanType,
    integer: numberType,
    null: nullType,
    number: numberType,
};

/**
 * Sort by code point, so the order is the same in every locale.
 *
 * @param a - type to compare
 * @param b - other type to compare
 * @returns negative if `a` sorts first, positive if `b` does
 */
/**
 * Every JSON type. `integer` is left out, as `number` includes it.
 */
const everyType: readonly JsonType[] = ['array', 'boolean', 'null', 'number', 'object', 'string'];

/**
 * JSON type of a value, as used by `enum` and `const`.
 *
 * @param value - an allowed value
 * @returns the most specific type of the value
 */
const typeOfValue = (value: unknown): JsonType => {
    if (value === null) {
        return 'null';
    }
    if (Array.isArray(value)) {
        return 'array';
    }
    if (typeof value === 'number') {
        // JSON Schema integers include those too large to be safe, e.g. `1e20`
        // eslint-disable-next-line unicorn/prefer-number-is-safe-integer
        return Number.isInteger(value) ? 'integer' : 'number';
    }
    return typeof value as 'boolean' | 'object' | 'string';
};

/**
 * Lowest (or highest) value of a number range, and whether it is excluded.
 */
interface Bound {
    exclusive: boolean;
    value: number;
}

/**
 * The tighter of two bounds of a number range.
 *
 * @param a - a bound, or `null` if absent
 * @param b - another bound, or `null` if absent
 * @param direction - `1` for a lower bound (the larger value is tighter), `-1` for an upper bound
 * @returns the tighter bound, or `null` if both are absent
 */
const tighterBound = (a: Bound | null, b: Bound | null, direction: -1 | 1): Bound | null => {
    if (!a || !b) {
        return a ?? b;
    }
    if (a.value === b.value) {
        return { exclusive: a.exclusive || b.exclusive, value: a.value };
    }
    return (a.value - b.value) * direction > 0 ? a : b;
};

/**
 * Value of a number bound keyword, or `null` if absent.
 */
type KeywordBound = boolean | number | null;

/**
 * Bound of a number range, from its inclusive and exclusive keywords.
 *
 * @param inclusive - `minimum` or `maximum`
 * @param exclusive - `exclusiveMinimum` or `exclusiveMaximum`, which is a boolean in OpenAPI 3.0
 * @param direction - `1` for a lower bound, `-1` for an upper bound
 * @returns the tighter bound, or `null` if there is none
 */
const numberBound = (
    inclusive: KeywordBound,
    exclusive: KeywordBound,
    direction: -1 | 1
): Bound | null =>
    tighterBound(
        typeof inclusive === 'number' ? { exclusive: exclusive === true, value: inclusive } : null,
        typeof exclusive === 'number' ? { exclusive: true, value: exclusive } : null,
        direction
    );

const compareNames = (a: NamedType, b: NamedType): number =>
    // eslint-disable-next-line sonarjs/strings-comparison
    a.name < b.name ? -1 : Number(a.name > b.name);

/**
 * Whether a type keyword (e.g. `maxLength`) applies to a JSON type. Number keywords apply to integers too.
 *
 * @param family - type the keyword applies to
 * @param type - JSON type
 * @returns true if the keyword constrains values of the type
 */
const isApplicable = (family: string, type: JsonType): boolean =>
    type === family || (type === 'integer' && family === 'number');

const isExcludable = (type: TsType): boolean =>
    type.kind === 'literal' || (type.kind === 'keyword' && type.keyword === 'null');

/**
 * `enum` and `const`.
 *
 * @param schema - schema with the keywords
 * @param pointer - JSON Pointer to the schema
 * @returns types of the allowed values
 * @throws {DecantInvalidSchemaError} if `enum` is not an array
 */
const valueTypes = (schema: SchemaObject, pointer: string): TsType[] => {
    const values: TsType[] = [];
    if (schema.enum !== undefined) {
        if (!Array.isArray(schema.enum)) {
            throw new DecantInvalidSchemaError('enum must be an array', {
                pointer: childPointer(pointer, 'enum'),
            });
        }
        values.push(union(schema.enum.map(value => jsonLiteral(value))));
    }
    if (Object.hasOwn(schema, 'const')) {
        values.push(jsonLiteral(schema.const));
    }
    return values;
};

/**
 * Why an object schema accepts no objects, if it doesn't.
 *
 * @param schema - schema of the objects
 * @param pointer - JSON Pointer to the schema
 * @param required - required property names
 * @param scope - context of the schema, including its own properties
 * @returns description of the contradiction, or `null` if there is none
 */
const objectContradiction = (
    schema: SchemaObject,
    pointer: string,
    required: readonly string[],
    scope: Scope
): string | null => {
    const minProperties =
        readCount(schema.minProperties, childPointer(pointer, 'minProperties')) ?? 0;
    const maxProperties = readCount(schema.maxProperties, childPointer(pointer, 'maxProperties'));
    const unique = new Set(required);
    if (maxProperties !== null && Math.max(minProperties, unique.size) > maxProperties) {
        return '"minProperties" or "required" need more properties than "maxProperties" allows';
    }
    const never = required.find(name => {
        const type = scope.properties.get(name);
        return type?.kind === 'keyword' && type.keyword === 'never';
    });
    if (never !== undefined) {
        return `Required property "${never}" is never valid`;
    }
    const declared = Object.keys(schema.properties ?? {}).length;
    if (
        schema.additionalProperties === false &&
        schema.patternProperties === undefined &&
        minProperties > declared
    ) {
        return '"minProperties" is more than the properties allowed';
    }
    return null;
};

/**
 * Converts a JSON Schema document to types.
 *
 * The root schema, every definition (`$defs`/`definitions`) at the root of the document,
 * and any other schema targeted by a `$ref`, becomes a named type.
 * Everything else is inlined.
 */
export class Converter {
    readonly #options: ConvertOptions;
    readonly #root: unknown;
    readonly #names = new TypeNames();
    /**
     * Name of each schema that is generated as a named type, keyed by JSON Pointer.
     */
    readonly #named = new Map<string, string>();
    /**
     * Named schemas, in the order they were found. Converting one may find more.
     */
    readonly #pending: { pointer: string; schema: unknown }[] = [];

    /**
     * @param root - root schema document
     * @param options - conversion options
     */
    public constructor(root: unknown, options: ConvertOptions) {
        this.#root = root;
        this.#options = options;
    }

    /**
     * Convert the document.
     *
     * @param rootName - name of the root schema's type
     * @returns named types, starting with the root, then the rest sorted by name
     * @throws {DecantError} if the schema is invalid, breaks a strict mode rule, or is not supported
     */
    public convert(rootName: string): NamedType[] {
        this.#register('#', rootName, this.#root);
        this.#registerDefinitions();

        const types: NamedType[] = [];
        // `#pending` grows while converting, as references are found. An array iterator includes them.
        for (const { pointer, schema } of this.#pending) {
            types.push({
                doc: readDoc(schema),
                name: this.#named.get(pointer)!,
                type: this.#convert(schema, pointer, emptyScope),
            });
        }
        const [root, ...rest] = types;
        return [root!, ...rest.toSorted(compareNames)];
    }

    /**
     * Name every definition at the root of the document, so each is generated even if it is not referenced.
     */
    #registerDefinitions(): void {
        if (!isSchemaObject(this.#root)) {
            return;
        }
        for (const container of ['$defs', 'definitions'] as const) {
            const definitions = this.#root[container];
            if (definitions === undefined) {
                continue;
            }
            const containerPointer = childPointer('#', container);
            const entries = Object.entries(readObject(definitions, containerPointer));
            for (const [name, schema] of entries) {
                this.#register(childPointer(containerPointer, name), name, schema);
            }
        }
    }

    #register(pointer: string, name: string, schema: unknown): string {
        const existing = this.#named.get(pointer);
        if (existing) {
            return existing;
        }
        const reserved = this.#names.reserve(name);
        this.#named.set(pointer, reserved);
        this.#pending.push({ pointer, schema });
        return reserved;
    }

    #reference(ref: unknown, refPointer: string): TsType {
        if (typeof ref !== 'string') {
            throw new DecantInvalidSchemaError('$ref must be a string', { pointer: refPointer });
        }
        const target = resolveRef(this.#root, ref, refPointer);
        const parent = target.pointer.slice(0, target.pointer.lastIndexOf('/'));
        const segments = target.pointer.split('/');
        // Name a definition after its key, and anything else after its whole path
        const name = definitionContainers.has(parent)
            ? segments.at(-1)!
            : segments.slice(1).join(' ');
        return {
            kind: 'reference',
            name: this.#register(
                target.pointer,
                name.replaceAll('~1', '/').replaceAll('~0', '~'),
                target.schema
            ),
        };
    }

    #strictError(message: string, pointer: string): void {
        if (this.#options.strict) {
            throw new DecantStrictModeError(message, { pointer });
        }
    }

    /**
     * Check every keyword is known and applies to the schema's types, and find the types the schema describes.
     *
     * @param schema - schema to check
     * @param pointer - JSON Pointer to the schema
     * @param scope - context inherited from parent schemas
     * @returns types of the schema, or `null` if it may be any type
     * @throws {DecantInvalidSchemaError} if `type` is invalid
     * @throws {DecantStrictModeError} if a keyword is unknown or does not apply, in strict mode
     * @throws {DecantUnsupportedError} if a keyword is not supported
     */
    #types(schema: SchemaObject, pointer: string, scope: Scope): readonly JsonType[] | null {
        const types = readTypes(schema.type, pointer) ?? scope.types;
        const families = new Set<'array' | 'number' | 'object' | 'string'>();

        for (const keyword of Object.keys(schema)) {
            const keywordPointer = childPointer(pointer, keyword);
            if (unsupportedKeywords.has(keyword)) {
                throw new DecantUnsupportedError(`"${keyword}" is not supported`, {
                    pointer: keywordPointer,
                });
            }
            const family = typeKeywords.get(keyword);
            if (family) {
                families.add(family);
                this.#checkFamily(keyword, family, types, keywordPointer);
            } else if (
                !keyword.startsWith('x-') &&
                !genericKeywords.has(keyword) &&
                !(this.#options.openApi30 && openApi30Keywords.has(keyword))
            ) {
                this.#strictError(`Unknown keyword "${keyword}"`, keywordPointer);
            }
        }

        // A schema without a type accepts every type. Its keywords constrain only their own,
        // so (outside strict mode, which requires a type) list every type for them to apply to
        return types ?? (families.size > 0 ? everyType : null);
    }

    /**
     * In strict mode, check every `enum` and `const` value is of the schema's types.
     *
     * @param schema - schema with the keywords
     * @param pointer - JSON Pointer to the schema
     * @param types - types of the schema, or `null` if any
     * @throws {DecantStrictModeError} if a value can never be valid, in strict mode
     */
    #checkValues(schema: SchemaObject, pointer: string, types: readonly JsonType[] | null): void {
        if (!types) {
            return;
        }
        const values = [
            ...(Array.isArray(schema.enum) ? (schema.enum as unknown[]) : []),
            ...(Object.hasOwn(schema, 'const') ? [schema.const] : []),
        ];
        for (const value of values) {
            const valueType = typeOfValue(value);
            if (types.every(type => !isApplicable(type, valueType))) {
                this.#strictError(
                    `${JSON.stringify(value)} is never valid, as it is not of the schema's type`,
                    pointer
                );
            }
        }
    }

    #checkFamily(
        keyword: string,
        family: string,
        types: readonly JsonType[] | null,
        pointer: string
    ): void {
        const expected = `"${keyword}" only applies to type "${family}"`;
        if (!types) {
            this.#strictError(`${expected}, but the schema has no type`, pointer);
        } else if (types.every(type => !isApplicable(family, type))) {
            const actual = types.map(type => `"${type}"`).join(', ');
            this.#strictError(`${expected}, not ${actual}`, pointer);
        }
    }

    #convert(schema: unknown, pointer: string, scope: Scope): TsType {
        if (schema === true) {
            return unknownType;
        }
        if (schema === false) {
            return neverType;
        }
        const object = readObject(schema, pointer);
        const types = this.#types(object, pointer, scope);
        this.#checkValues(object, pointer, types);
        const subScope: Scope = {
            properties: new Map([...scope.properties, ...this.#propertyTypes(object, pointer)]),
            types,
        };

        // Without type specific keywords, a subschema adds nothing to the types it inherits
        const isTyped =
            object.type !== undefined ||
            Object.keys(object).some(keyword => typeKeywords.has(keyword));
        const parts: TsType[] = [
            isTyped && types
                ? union(types.map(type => this.#typed(object, pointer, type, subScope)))
                : unknownType,
            ...valueTypes(object, pointer),
            ...this.#compositions(object, pointer, subScope),
        ];
        if (object.$ref !== undefined) {
            parts.push(this.#reference(object.$ref, childPointer(pointer, '$ref')));
        }

        let type = intersection(parts);
        if (object.not !== undefined) {
            type = this.#not(type, object.not, childPointer(pointer, 'not'), subScope);
        }
        return this.#nullable(object, pointer, type);
    }

    /**
     * `allOf`, `anyOf`, `oneOf` and `if`/`then`/`else`.
     *
     * @param schema - schema with the keywords
     * @param pointer - JSON Pointer to the schema
     * @param scope - context for the subschemas
     * @returns types to intersect with the schema's type
     */
    #compositions(schema: SchemaObject, pointer: string, scope: Scope): TsType[] {
        const convertAll = (keyword: 'allOf' | 'anyOf' | 'oneOf'): TsType[] => {
            const keywordPointer = childPointer(pointer, keyword);
            return readSchemaArray(schema[keyword], keywordPointer).map((member, i) =>
                this.#convert(member, childPointer(keywordPointer, i), scope)
            );
        };
        return [
            ...(schema.allOf === undefined ? [] : convertAll('allOf')),
            ...(schema.anyOf === undefined ? [] : [union(convertAll('anyOf'))]),
            ...(schema.oneOf === undefined ? [] : [union(convertAll('oneOf'))]),
            this.#conditional(schema, pointer, scope),
        ];
    }

    /**
     * `if`/`then`/`else`: values matching `if` must match `then`, others must match `else`.
     *
     * @param schema - schema with the conditional
     * @param pointer - JSON Pointer to the schema
     * @param scope - context for the subschemas
     * @returns type of the conditional, or `unknown` without one
     */
    #conditional(schema: SchemaObject, pointer: string, scope: Scope): TsType {
        if (schema.if === undefined) {
            for (const keyword of ['then', 'else'] as const) {
                if (schema[keyword] !== undefined) {
                    this.#strictError(
                        `"${keyword}" has no effect without "if"`,
                        childPointer(pointer, keyword)
                    );
                }
            }
            return unknownType;
        }
        const [ifType, thenType, elseType] = (['if', 'then', 'else'] as const).map(keyword =>
            schema[keyword] === undefined
                ? unknownType
                : this.#convert(schema[keyword], childPointer(pointer, keyword), scope)
        );
        return union([intersection([ifType!, thenType!]), elseType!]);
    }

    /**
     * Narrow a type by `not`.
     *
     * Only exact matches can be removed: `not: {}` makes the type `never`,
     * and a `not` of `null` or literal values removes them from a union.
     * Any other `not` is checked, but leaves the type as it is.
     *
     * @param type - type to narrow
     * @param not - value of the `not` keyword
     * @param pointer - JSON Pointer to the `not` keyword
     * @param scope - context for the subschema
     * @returns narrowed type
     */
    #not(type: TsType, not: unknown, pointer: string, scope: Scope): TsType {
        const notType = this.#convert(not, pointer, scope);
        if (notType.kind === 'keyword' && notType.keyword === 'unknown') {
            return neverType;
        }
        const excluded = notType.kind === 'union' ? notType.members : [notType];
        return excluded.every(member => isExcludable(member)) ? exclude(type, excluded) : type;
    }

    /**
     * OpenAPI 3.0 `nullable`.
     *
     * @param schema - schema with the keyword
     * @param pointer - JSON Pointer to the schema
     * @param type - type of the schema
     * @returns type, or the type or `null` if nullable
     * @throws {DecantInvalidSchemaError} if `nullable` is not a boolean
     */
    #nullable(schema: SchemaObject, pointer: string, type: TsType): TsType {
        if (!this.#options.openApi30 || schema.nullable === undefined) {
            return type;
        }
        if (typeof schema.nullable !== 'boolean') {
            throw new DecantInvalidSchemaError('nullable must be a boolean', {
                pointer: childPointer(pointer, 'nullable'),
            });
        }
        return schema.nullable ? union([type, nullType]) : type;
    }

    /**
     * Type of the schema's values of one JSON type, constrained by that type's keywords.
     *
     * @param schema - schema whose keywords constrain the values
     * @param pointer - JSON Pointer to the schema
     * @param type - JSON type of the values
     * @param scope - context of the schema, including its own properties
     * @returns type of the values
     */
    #typed(schema: SchemaObject, pointer: string, type: JsonType, scope: Scope): TsType {
        if (type === 'string') {
            return this.#string(schema, pointer);
        }
        if (type === 'number' || type === 'integer') {
            return this.#number(schema, pointer, type);
        }
        if (type === 'array') {
            return this.#array(schema, pointer);
        }
        return type === 'object' ? this.#objectType(schema, pointer, scope) : primitiveTypes[type]!;
    }

    /**
     * A type no value can match, because the schema contradicts itself. Fails in strict mode.
     *
     * @param message - why no value can match
     * @param pointer - JSON Pointer to the schema
     * @returns `never`
     * @throws {DecantStrictModeError} in strict mode
     */
    #contradiction(message: string, pointer: string): TsType {
        this.#strictError(`${message}, so no value is valid`, pointer);
        return neverType;
    }

    #string(schema: SchemaObject, pointer: string): TsType {
        const minLength = readCount(schema.minLength, childPointer(pointer, 'minLength')) ?? 0;
        const maxLength = readCount(schema.maxLength, childPointer(pointer, 'maxLength'));
        if (maxLength !== null && minLength > maxLength) {
            return this.#contradiction('"minLength" is greater than "maxLength"', pointer);
        }
        return schema.pattern === undefined
            ? stringType
            : patternType(readPattern(schema.pattern, childPointer(pointer, 'pattern')));
    }

    #number(schema: SchemaObject, pointer: string, type: 'integer' | 'number'): TsType {
        const read = (keyword: string): KeywordBound =>
            readBound(
                schema[keyword],
                childPointer(pointer, keyword),
                // OpenAPI 3.0 marks `minimum` and `maximum` exclusive with booleans
                this.#options.openApi30 && keyword.startsWith('exclusive')
            );
        const [minimum, exclusiveMinimum, maximum, exclusiveMaximum] = [
            'minimum',
            'exclusiveMinimum',
            'maximum',
            'exclusiveMaximum',
        ].map(keyword => read(keyword));
        const lower = numberBound(minimum!, exclusiveMinimum!, 1);
        const upper = numberBound(maximum!, exclusiveMaximum!, -1);
        if (!lower || !upper) {
            return numberType;
        }

        // The integers nearest to each bound, within it
        const lowest = lower.exclusive ? Math.floor(lower.value) + 1 : Math.ceil(lower.value);
        const highest = upper.exclusive ? Math.ceil(upper.value) - 1 : Math.floor(upper.value);
        const isEmpty =
            type === 'integer'
                ? lowest > highest
                : lower.value > upper.value ||
                  (lower.value === upper.value && (lower.exclusive || upper.exclusive));
        return isEmpty
            ? this.#contradiction(`The minimum and maximum allow no ${type}`, pointer)
            : numberType;
    }

    #array(schema: SchemaObject, pointer: string): TsType {
        const minItems = readCount(schema.minItems, childPointer(pointer, 'minItems')) ?? 0;
        const maxItems = readCount(schema.maxItems, childPointer(pointer, 'maxItems'));
        const minContains = readCount(schema.minContains, childPointer(pointer, 'minContains'));
        const maxContains = readCount(schema.maxContains, childPointer(pointer, 'maxContains'));
        if (maxItems !== null && minItems > maxItems) {
            return this.#contradiction('"minItems" is greater than "maxItems"', pointer);
        }
        // `minContains` and `maxContains` only apply with `contains`
        if (
            maxContains !== null &&
            schema.contains !== undefined &&
            (minContains ?? 1) > maxContains
        ) {
            return this.#contradiction('"minContains" is greater than "maxContains"', pointer);
        }

        // Draft 2020-12 `prefixItems` + `items`, or the older array form of `items` + `additionalItems`
        const [prefixKeyword, restKeyword] = Array.isArray(schema.items)
            ? (['items', 'additionalItems'] as const)
            : (['prefixItems', 'items'] as const);
        const prefixPointer = childPointer(pointer, prefixKeyword);
        const prefix =
            schema[prefixKeyword] === undefined
                ? []
                : readSchemaArray(schema[prefixKeyword], prefixPointer).map((item, i) =>
                      this.#convert(item, childPointer(prefixPointer, i), emptyScope)
                  );
        const rest =
            schema[restKeyword] === undefined
                ? unknownType
                : this.#convert(
                      schema[restKeyword],
                      childPointer(pointer, restKeyword),
                      emptyScope
                  );

        const isRestNever = rest.kind === 'keyword' && rest.keyword === 'never';
        if (isRestNever && minItems > prefix.length) {
            return this.#contradiction(
                '"minItems" is greater than the number of "prefixItems", and "items" is false',
                pointer
            );
        }
        if (maxItems !== null && maxItems < prefix.length) {
            this.#strictError(
                `"maxItems" is less than the number of "${prefixKeyword}", so the last are never valid`,
                pointer
            );
        }
        if (prefix.length === 0) {
            return isRestNever
                ? { kind: 'tuple', elements: [], rest: null }
                : { kind: 'array', element: rest };
        }
        // Items beyond `maxItems` can't be present
        const isTruncated = maxItems !== null && maxItems < prefix.length;
        return {
            kind: 'tuple',
            // Items beyond `minItems` may be missing
            elements: prefix.slice(0, maxItems ?? prefix.length).map((item, i) => ({
                optional: i >= minItems,
                type: item,
            })),
            rest: isRestNever || isTruncated ? null : rest,
        };
    }

    /**
     * Types of the properties a schema declares.
     *
     * @param schema - schema with `properties`
     * @param pointer - JSON Pointer to the schema
     * @returns type of each property in `properties`
     */
    #propertyTypes(schema: SchemaObject, pointer: string): Map<string, TsType> {
        if (schema.properties === undefined) {
            return new Map();
        }
        const propertiesPointer = childPointer(pointer, 'properties');
        const entries = Object.entries(readObject(schema.properties, propertiesPointer));
        return new Map(
            entries.map(([name, propertySchema]) => [
                name,
                this.#convert(propertySchema, childPointer(propertiesPointer, name), emptyScope),
            ])
        );
    }

    /**
     * Type of a schema's objects, from its properties, additional properties and dependents.
     *
     * @param schema - schema with object keywords
     * @param pointer - JSON Pointer to the schema
     * @param scope - context of the schema, including its own properties
     * @returns type of the objects
     */
    #objectType(schema: SchemaObject, pointer: string, scope: Scope): TsType {
        const propertySchemas = (schema.properties ?? {}) as SchemaObject;
        const required = readPropertyNames(schema.required, childPointer(pointer, 'required'));

        const properties: TsProperty[] = Object.entries(propertySchemas).map(
            ([name, propertySchema]) => ({
                name,
                doc: readDoc(propertySchema),
                optional: !required.includes(name),
                type: scope.properties.get(name)!,
            })
        );
        for (const name of required) {
            if (Object.hasOwn(propertySchemas, name)) {
                continue;
            }
            // Declared by a parent schema, e.g. `required` in an `allOf` member
            const type = scope.properties.get(name);
            if (!type) {
                this.#strictError(
                    `Required property "${name}" is not in "properties"`,
                    childPointer(pointer, 'required')
                );
            }
            properties.push({ name, doc: null, optional: false, type: type ?? unknownType });
        }
        const contradiction = objectContradiction(schema, pointer, required, scope);
        if (contradiction) {
            return this.#contradiction(contradiction, pointer);
        }

        const index = this.#patternProperties(schema, pointer, properties);
        const { additionalProperties } = schema;
        if (additionalProperties !== undefined && additionalProperties !== false) {
            index.push({
                key: stringType,
                value: this.#convert(
                    additionalProperties,
                    childPointer(pointer, 'additionalProperties'),
                    emptyScope
                ),
            });
        }

        const dependents = this.#dependents(schema, pointer, scope);
        if (properties.length > 0 || index.length > 0) {
            return intersection([{ kind: 'object', properties, index }, ...dependents]);
        }
        const noProperties: TsType = {
            kind: 'object',
            properties: [],
            index: [{ key: stringType, value: neverType }],
        };
        return intersection([
            additionalProperties === false ? noProperties : objectType,
            ...dependents,
        ]);
    }

    /**
     * `patternProperties`, as index signatures. A pattern matching exactly one key is added as that property.
     *
     * @param schema - schema with `patternProperties`
     * @param pointer - JSON Pointer to the schema
     * @param properties - properties of the schema, which exact patterns are added to
     * @returns index signatures
     */
    #patternProperties(schema: SchemaObject, pointer: string, properties: TsProperty[]): TsIndex[] {
        if (schema.patternProperties === undefined) {
            return [];
        }
        const index: TsIndex[] = [];
        const patternPointer = childPointer(pointer, 'patternProperties');
        const entries = Object.entries(readObject(schema.patternProperties, patternPointer));
        for (const [pattern, patternSchema] of entries) {
            const keyPointer = childPointer(patternPointer, pattern);
            const key = patternType(readPattern(pattern, keyPointer));
            const value = this.#convert(patternSchema, keyPointer, emptyScope);
            if (key.kind === 'literal') {
                properties.push({
                    name: key.value as string,
                    doc: null,
                    optional: true,
                    type: value,
                });
            } else {
                index.push({ key, value });
            }
        }
        return index;
    }

    /**
     * `dependentRequired` and `dependentSchemas` (or the older `dependencies`): when a property is present,
     * other properties are required, or another schema applies.
     *
     * @param schema - object schema with the keywords
     * @param pointer - JSON Pointer to the schema
     * @param scope - context of the schema, including its own properties
     * @returns types to intersect with the object
     */
    #dependents(schema: SchemaObject, pointer: string, scope: Scope): TsType[] {
        const dependents: TsType[] = [];
        const objectScope: Scope = { properties: scope.properties, types: ['object'] };
        for (const keyword of ['dependentRequired', 'dependentSchemas', 'dependencies'] as const) {
            if (schema[keyword] === undefined) {
                continue;
            }
            const keywordPointer = childPointer(pointer, keyword);
            const entries = Object.entries(readObject(schema[keyword], keywordPointer));
            for (const [name, dependent] of entries) {
                const dependentPointer = childPointer(keywordPointer, name);
                const absent: TsType = {
                    kind: 'object',
                    properties: [{ name, doc: null, optional: true, type: neverType }],
                    index: [],
                };
                const isSchema =
                    keyword === 'dependentSchemas' ||
                    (keyword === 'dependencies' && !Array.isArray(dependent));
                const present: TsType = isSchema
                    ? this.#convert(dependent, dependentPointer, objectScope)
                    : {
                          kind: 'object',
                          properties: readPropertyNames(dependent, dependentPointer).map(
                              required => ({
                                  name: required,
                                  doc: null,
                                  optional: false,
                                  type: scope.properties.get(required) ?? unknownType,
                              })
                          ),
                          index: [],
                      };
                dependents.push(union([absent, present]));
            }
        }
        return dependents;
    }
}

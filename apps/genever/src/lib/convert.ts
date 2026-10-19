import type { Dialect, JsonType } from './keywords.js';
import type { SchemaObject } from './read-keyword.js';
import type { DocumentIndex, Target } from './resources.js';
import type { TsDoc, TsIndex, TsProperty, TsType } from './ts-type.js';
import {
    GeneverInvalidSchemaError,
    GeneverStrictModeError,
    GeneverUnsupportedError,
} from './errors.js';
import {
    genericKeywords,
    openApi30Keywords,
    openApiKeywords,
    typeKeywords,
    unsupportedKeywords,
} from './keywords.js';
import { TypeNames } from './names.js';
import { operationTypes } from './operations.js';
import { patternType } from './pattern.js';
import { childPointer } from './pointer.js';
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
import { indexDocument, inputSchemas, isDraft04Schema, resolveReference } from './resources.js';
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

/**
 * Default for `typedMinItems`, the same as Juniper's.
 */
export const defaultTypedMinItems = 3;

export interface ConvertOptions {
    /**
     * URI the document was read from, which relative `$id`s and `$ref`s resolve against.
     */
    readonly baseUri: string;
    /**
     * Flavour of JSON Schema, which decides the keywords allowed (e.g. `nullable` in OpenAPI 3.0).
     */
    readonly dialect: Dialect;
    /**
     * Fail on schemas that are valid, but likely mistakes. See the README for the rules.
     */
    readonly strict: boolean;
    /**
     * Largest `minItems` typed as that many required items, e.g. `[T, ...T[]]` for `minItems: 1`.
     */
    readonly typedMinItems: number;
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
    /**
     * Canonical JSON Pointers of the referenced schemas this one is part of, without a property or item
     * in between, so it applies to the same value: the named type being converted, and any schema inlined
     * into it. A `$ref` back to one of them never matches anything a terminating validator could accept.
     */
    readonly unguarded: readonly string[];
}

const emptyScope: Scope = { properties: new Map(), types: null, unguarded: [] };

/**
 * Keywords whose subschemas apply to the same value as their schema, rather than to a property or item:
 * one schema, or a collection (array or map) of them.
 */
const sameValueKeywords = ['if', 'then', 'else', 'not'] as const;
const sameValueCollectionKeywords = [
    'allOf',
    'anyOf',
    'oneOf',
    'dependentSchemas',
    'dependencies',
] as const;

/**
 * Name of the type of a referenced schema: a definition (in any `$defs`, `definitions`, or OpenAPI's
 * `components.schemas`) is named after its key, and anything else after its whole path.
 *
 * @param pointer - canonical JSON Pointer to the schema
 * @returns name, before it is made a valid and unique type name
 */
const referenceName = (pointer: string): string => {
    const parent = pointer.slice(0, pointer.lastIndexOf('/'));
    const isDefinition =
        parent.endsWith('/$defs') ||
        parent.endsWith('/definitions') ||
        parent === '#/components/schemas';
    const segments = pointer
        .slice(isDefinition ? parent.length + 1 : 2)
        .split('/')
        .map(segment => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
    return segments.join(' ');
};

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
 * @param exclusive - `exclusiveMinimum` or `exclusiveMaximum`, which is a boolean in OpenAPI 3.0 and draft-04
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
 * @throws {GeneverInvalidSchemaError} if `enum` is not an array
 */
const valueTypes = (schema: SchemaObject, pointer: string): TsType[] => {
    const values: TsType[] = [];
    if (schema.enum !== undefined) {
        if (!Array.isArray(schema.enum)) {
            throw new GeneverInvalidSchemaError('enum must be an array', {
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
 * Check an OpenAPI `discriminator` names a property. It doesn't change the type.
 *
 * @param discriminator - value of the keyword
 * @param pointer - JSON Pointer to the keyword
 * @throws {GeneverInvalidSchemaError} if it has no `propertyName`
 */
const checkDiscriminator = (discriminator: unknown, pointer: string): void => {
    if (typeof readObject(discriminator, pointer).propertyName !== 'string') {
        throw new GeneverInvalidSchemaError('discriminator must have a propertyName', {
            pointer: childPointer(pointer, 'propertyName'),
        });
    }
};

/**
 * Keywords of a schema that only groups definitions, such as a bundled file of shared `$defs`.
 */
const groupKeywords = new Set([
    '$comment',
    '$defs',
    '$id',
    '$schema',
    'definitions',
    'description',
    'title',
]);

/**
 * Whether a schema only groups other definitions, and so is not a type of its own.
 * Its definitions are still types when referenced, and it is too if referenced itself.
 *
 * @param schema - a definition
 * @returns true if the schema has definitions, and no keywords other than annotations
 */
const isDefinitionGroup = (schema: unknown): boolean =>
    isSchemaObject(schema) &&
    (schema.$defs !== undefined || schema.definitions !== undefined) &&
    Object.keys(schema).every(keyword => groupKeywords.has(keyword));

/**
 * Whether a schema only gives another URI to a resource, with an `$id` and a `$ref` (e.g. a file whose own
 * `$id` is not where it was loaded from). References see through it, so it is not a type of its own.
 *
 * @param schema - a schema
 * @returns true if the schema has only `$id` and `$ref`
 */
const isResourceAlias = (schema: unknown): schema is SchemaObject & { $ref: string } =>
    isSchemaObject(schema) &&
    typeof schema.$id === 'string' &&
    typeof schema.$ref === 'string' &&
    Object.keys(schema).length === 2;

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
     * Schema resources and anchors of the document, which references resolve to.
     */
    #index: DocumentIndex | null = null;
    /**
     * Result of {@link #sameValueReferences}, keyed by the referenced schema's pointer.
     */
    readonly #sameValueCache = new Map<string, ReadonlySet<string>>();

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
     * @throws {GeneverError} if the schema is invalid, breaks a strict mode rule, or is not supported
     */
    public convert(rootName: string): NamedType[] {
        this.#index = indexDocument(
            this.#root,
            inputSchemas(this.#root, false),
            this.#options.baseUri
        );
        this.#register('#', rootName, this.#root);
        this.#registerDefinitions();

        const [root, ...rest] = this.#convertPending();
        return [root!, ...rest.toSorted(compareNames)];
    }

    /**
     * Convert an OpenAPI document. Each of its `components.schemas` becomes a named type, followed by
     * `Paths` and `Operations` for its operations, if it has any.
     *
     * @returns named types: components sorted by name, then the operation types
     * @throws {GeneverError} if a schema is invalid, breaks a strict mode rule, or is not supported
     */
    public convertDocument(): NamedType[] {
        this.#registerContainer(['components', 'schemas']);
        // A document is not a schema, but each of its components is
        this.#index = indexDocument(
            this.#root,
            inputSchemas(this.#root, true),
            this.#options.baseUri
        );
        // Reserved after the components, so they keep their names
        const pathsName = this.#names.reserve('Paths');
        const operationsName = this.#names.reserve('Operations');
        const operations = operationTypes(
            this.#root,
            {
                convert: (schema, pointer) => this.#convert(schema, pointer, emptyScope),
                resolve: (ref, refPointer) => this.#resolve(ref, refPointer),
            },
            operationsName
        );
        return [
            ...this.#convertPending().toSorted(compareNames),
            ...(operations
                ? [
                      { doc: null, name: pathsName, type: operations.paths },
                      { doc: null, name: operationsName, type: operations.operations },
                  ]
                : []),
        ];
    }

    #convertPending(): NamedType[] {
        const types: NamedType[] = [];
        // `#pending` grows while converting, as references are found. An array iterator includes them.
        for (const { pointer, schema } of this.#pending) {
            types.push({
                doc: readDoc(schema),
                name: this.#named.get(pointer)!,
                type: this.#convert(schema, pointer, { ...emptyScope, unguarded: [pointer] }),
            });
        }
        return types;
    }

    /**
     * Name every definition at the root of the document, so each is generated even if it is not referenced.
     */
    #registerDefinitions(): void {
        this.#registerContainer(['$defs']);
        this.#registerContainer(['definitions']);
    }

    /**
     * Name every schema of a container, such as `$defs`.
     *
     * @param path - keys of the container, from the root of the document
     * @throws {GeneverInvalidSchemaError} if the container, or an object on the way to it, is not an object
     */
    #registerContainer(path: readonly string[]): void {
        if (!isSchemaObject(this.#root)) {
            return;
        }
        let container = this.#root;
        let containerPointer = '#';
        for (const key of path) {
            if (container[key] === undefined) {
                return;
            }
            containerPointer = childPointer(containerPointer, key);
            container = readObject(container[key], containerPointer);
        }
        for (const [name, schema] of Object.entries(container)) {
            if (!isDefinitionGroup(schema) && !isResourceAlias(schema)) {
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

    /**
     * Resolve a `$ref`, seeing through resource aliases.
     *
     * @param ref - value of the `$ref` keyword
     * @param refPointer - JSON Pointer to the `$ref` keyword
     * @returns the schema it refers to
     * @throws {GeneverInvalidSchemaError} if the `$ref` is invalid, or only refers to itself
     * @throws {GeneverUnsupportedError} if the `$ref` is to another document
     */
    #resolve(ref: unknown, refPointer: string): Target {
        if (typeof ref !== 'string') {
            throw new GeneverInvalidSchemaError('$ref must be a string', { pointer: refPointer });
        }
        const schemaPointer = refPointer.slice(0, refPointer.lastIndexOf('/'));
        let target = resolveReference(this.#index!, ref, schemaPointer);
        const aliases = new Set<string>();
        while (isResourceAlias(target.schema)) {
            if (aliases.has(target.pointer)) {
                throw new GeneverInvalidSchemaError(`$ref "${ref}" only refers to itself`, {
                    pointer: refPointer,
                });
            }
            aliases.add(target.pointer);
            target = resolveReference(this.#index!, target.schema.$ref, target.pointer);
        }
        return target;
    }

    /**
     * Every schema a schema refers to, directly or through others, that applies to the same value:
     * by `$ref`s outside any property or item.
     *
     * @param target - referenced schema
     * @returns canonical JSON Pointers of the schemas
     */
    #sameValueReferences(target: Target): ReadonlySet<string> {
        const cached = this.#sameValueCache.get(target.pointer);
        if (cached) {
            return cached;
        }
        const found = new Set<string>();
        const visit = (schema: unknown, pointer: string): void => {
            if (!isSchemaObject(schema)) {
                return;
            }
            for (const keyword of sameValueKeywords) {
                visit(schema[keyword], childPointer(pointer, keyword));
            }
            for (const keyword of sameValueCollectionKeywords) {
                const value = schema[keyword];
                // `dependencies` values may also be arrays of property names, which are skipped
                if (Array.isArray(value) || isSchemaObject(value)) {
                    for (const [key, subschema] of Object.entries(value)) {
                        visit(subschema, childPointer(childPointer(pointer, keyword), key));
                    }
                }
            }
            if (schema.$ref === undefined) {
                return;
            }
            let referenced: Target;
            try {
                referenced = this.#resolve(schema.$ref, childPointer(pointer, '$ref'));
            } catch {
                // Thrown when the reference itself is converted
                return;
            }
            if (found.has(referenced.pointer)) {
                return;
            }
            found.add(referenced.pointer);
            visit(referenced.schema, referenced.pointer);
        };
        visit(target.schema, target.pointer);
        this.#sameValueCache.set(target.pointer, found);
        return found;
    }

    /**
     * The type of a `$ref`: usually the referenced schema's named type.
     *
     * A reference back to a schema it is part of, applying to the same value, is `never`: it can never be
     * why a value is valid, and a validator would recurse forever on it. A schema that would only reach
     * back to this one (e.g. a mutual `anyOf`) is inlined, as TypeScript rejects a type alias that refers
     * to itself outside an object or array.
     *
     * @param ref - value of the `$ref` keyword
     * @param refPointer - JSON Pointer to the `$ref` keyword
     * @param scope - context of the schema with the `$ref`
     * @returns type of the referenced schema
     * @throws {GeneverStrictModeError} if it refers back to a schema it is part of, in strict mode
     */
    #reference(ref: unknown, refPointer: string, scope: Scope): TsType {
        const target = this.#resolve(ref, refPointer);
        if (scope.unguarded.includes(target.pointer)) {
            this.#strictError(
                `$ref "${ref as string}" refers back to a schema it is part of, without a property or item in between, so it never matches`,
                refPointer
            );
            return neverType;
        }
        const reachable = this.#sameValueReferences(target);
        if (scope.unguarded.some(pointer => reachable.has(pointer))) {
            return this.#convert(target.schema, target.pointer, {
                ...emptyScope,
                unguarded: [...scope.unguarded, target.pointer],
            });
        }
        return {
            kind: 'reference',
            name: this.#register(target.pointer, referenceName(target.pointer), target.schema),
        };
    }

    /**
     * Check, in strict mode, that a schema's `discriminator` can tell its branches apart: the
     * property is required, by the schema or by every `oneOf`/`anyOf` branch, and every `mapping`
     * target exists. Its value isn't checked, as OpenAPI may infer it from a component's name.
     *
     * @param schema - schema with a `discriminator`
     * @param pointer - JSON Pointer to the schema
     * @throws {GeneverStrictModeError} if the discriminator can't apply, in strict mode
     */
    #checkDiscriminatorUse(schema: SchemaObject, pointer: string): void {
        const discriminatorPointer = childPointer(pointer, 'discriminator');
        const { propertyName, mapping } = schema.discriminator as {
            propertyName: string;
            mapping?: unknown;
        };
        const branchesKeyword = ['oneOf', 'anyOf'].find(keyword => Array.isArray(schema[keyword]));
        const branches = branchesKeyword ? (schema[branchesKeyword] as unknown[]) : [];
        const isRequired =
            this.#requires(schema, pointer, propertyName) ||
            (branches.length > 0 &&
                branches.every((branch, i) =>
                    this.#requires(
                        branch,
                        childPointer(childPointer(pointer, branchesKeyword!), i),
                        propertyName
                    )
                ));
        if (!isRequired) {
            this.#strictError(
                `discriminator property "${propertyName}" must be required, by the schema or by every oneOf or anyOf branch`,
                discriminatorPointer
            );
        }

        const mappingPointer = childPointer(discriminatorPointer, 'mapping');
        const targets = mapping === undefined ? {} : readObject(mapping, mappingPointer);
        for (const [value, target] of Object.entries(targets)) {
            const targetPointer = childPointer(mappingPointer, value);
            // A mapping value is a reference, or the name of a schema in the document's components
            const ref =
                typeof target === 'string' && !target.includes('/')
                    ? `#/components/schemas/${target}`
                    : target;
            try {
                this.#resolve(ref, childPointer(targetPointer, '$ref'));
            } catch {
                this.#strictError(
                    `discriminator mapping "${value}" refers to a schema that does not exist`,
                    targetPointer
                );
            }
        }
    }

    /**
     * Whether a schema requires a property, itself or through a `$ref` or `allOf`.
     *
     * @param schema - schema to check
     * @param pointer - JSON Pointer to the schema
     * @param property - property name
     * @param [seen] - schemas already checked, to stop at cycles
     * @returns true if every valid value has the property
     */
    #requires(
        schema: unknown,
        pointer: string,
        property: string,
        seen: ReadonlySet<string> = new Set()
    ): boolean {
        if (!isSchemaObject(schema) || seen.has(pointer)) {
            return false;
        }
        if (Array.isArray(schema.required) && schema.required.includes(property)) {
            return true;
        }
        const next = new Set([...seen, pointer]);
        if (schema.$ref !== undefined) {
            const refPointer = childPointer(pointer, '$ref');
            let target: Target;
            try {
                target = this.#resolve(schema.$ref, refPointer);
            } catch {
                // Converting the reference reports it, rather than a misleading discriminator error
                return true;
            }
            if (this.#requires(target.schema, target.pointer, property, next)) {
                return true;
            }
        }
        return (
            Array.isArray(schema.allOf) &&
            schema.allOf.some((member, i) =>
                this.#requires(
                    member,
                    childPointer(childPointer(pointer, 'allOf'), i),
                    property,
                    next
                )
            )
        );
    }

    #strictError(message: string, pointer: string): void {
        if (this.#options.strict) {
            throw new GeneverStrictModeError(message, { pointer });
        }
    }

    /**
     * Check every keyword is known and applies to the schema's types, and find the types the schema describes.
     *
     * @param schema - schema to check
     * @param pointer - JSON Pointer to the schema
     * @param scope - context inherited from parent schemas
     * @returns types of the schema, or `null` if it may be any type
     * @throws {GeneverInvalidSchemaError} if `type` is invalid
     * @throws {GeneverStrictModeError} if a keyword is unknown or does not apply, in strict mode
     * @throws {GeneverUnsupportedError} if a keyword is not supported
     */
    #types(schema: SchemaObject, pointer: string, scope: Scope): readonly JsonType[] | null {
        const types = readTypes(schema.type, pointer) ?? scope.types;
        const families = new Set<'array' | 'number' | 'object' | 'string'>();

        for (const keyword of Object.keys(schema)) {
            const keywordPointer = childPointer(pointer, keyword);
            if (unsupportedKeywords.has(keyword)) {
                throw new GeneverUnsupportedError(`"${keyword}" is not supported`, {
                    pointer: keywordPointer,
                });
            }
            const family = typeKeywords.get(keyword);
            if (family) {
                families.add(family);
                this.#checkFamily(keyword, family, types, keywordPointer);
            } else if (!this.#isKnownKeyword(keyword, pointer)) {
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
     * @throws {GeneverStrictModeError} if a value can never be valid, in strict mode
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

    #isKnownKeyword(keyword: string, pointer: string): boolean {
        const { dialect } = this.#options;
        return (
            keyword.startsWith('x-') ||
            // Draft-04 names a schema's resource with `id`
            (keyword === 'id' && isDraft04Schema(this.#index!, pointer)) ||
            genericKeywords.has(keyword) ||
            // Also in plain JSON Schema: Juniper emits it for discriminated `oneOf`s, and Ajv supports it
            keyword === 'discriminator' ||
            (dialect !== 'draft-2020-12' && openApiKeywords.has(keyword)) ||
            (dialect === 'openapi-3.0' && openApi30Keywords.has(keyword))
        );
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
        if (object.discriminator !== undefined) {
            checkDiscriminator(object.discriminator, childPointer(pointer, 'discriminator'));
            this.#checkDiscriminatorUse(object, pointer);
        }
        const subScope: Scope = {
            properties: new Map([...scope.properties, ...this.#propertyTypes(object, pointer)]),
            unguarded: scope.unguarded,
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
            parts.push(this.#reference(object.$ref, childPointer(pointer, '$ref'), scope));
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
     * @throws {GeneverInvalidSchemaError} if `nullable` is not a boolean
     */
    #nullable(schema: SchemaObject, pointer: string, type: TsType): TsType {
        if (this.#options.dialect !== 'openapi-3.0' || schema.nullable === undefined) {
            return type;
        }
        if (typeof schema.nullable !== 'boolean') {
            throw new GeneverInvalidSchemaError('nullable must be a boolean', {
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
     * @throws {GeneverStrictModeError} in strict mode
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
                // OpenAPI 3.0 and draft-04 mark `minimum` and `maximum` exclusive with booleans
                (this.#options.dialect === 'openapi-3.0' ||
                    isDraft04Schema(this.#index!, pointer)) &&
                    keyword.startsWith('exclusive')
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
        // Up to `typedMinItems`, the items `minItems` requires beyond the prefix items are typed,
        // e.g. `[T, ...T[]]`. (Without `items`, more items than the prefix are a contradiction, above.)
        const required =
            minItems <= this.#options.typedMinItems
                ? Array.from({ length: Math.max(minItems - prefix.length, 0) }, () => rest)
                : [];
        if (prefix.length === 0 && required.length === 0) {
            return isRestNever
                ? { kind: 'tuple', elements: [], rest: null }
                : { kind: 'array', element: rest };
        }
        // Items beyond `maxItems` can't be present
        const isTruncated = maxItems !== null && maxItems < prefix.length;
        return {
            kind: 'tuple',
            elements: [
                // Prefix items beyond `minItems` may be missing
                ...prefix.slice(0, maxItems ?? prefix.length).map((item, i) => ({
                    optional: i >= minItems,
                    type: item,
                })),
                ...required.map(type => ({ optional: false, type })),
            ],
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
        const nameKeys = this.#propertyNameKeys(schema, pointer);
        if (additionalProperties !== undefined && additionalProperties !== false) {
            const value = this.#convert(
                additionalProperties,
                childPointer(pointer, 'additionalProperties'),
                emptyScope
            );
            for (const key of nameKeys) {
                if (key.kind !== 'literal') {
                    index.push({ key, value });
                } else if (properties.every(property => property.name !== key.value)) {
                    // A literal key can't be an index signature, so it is an optional property
                    properties.push({
                        name: key.value as string,
                        doc: null,
                        optional: true,
                        type: value,
                    });
                }
            }
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
        // `propertyNames: false` allows no keys, as `additionalProperties: false` does without properties
        return intersection([
            additionalProperties === false || nameKeys.length === 0 ? noProperties : objectType,
            ...dependents,
        ]);
    }

    /**
     * Keys `propertyNames` allows, as the keys of `additionalProperties`.
     *
     * @param schema - schema with `propertyNames`
     * @param pointer - JSON Pointer to the schema
     * @returns key types: `string`, template literals, or string literals
     */
    #propertyNameKeys(schema: SchemaObject, pointer: string): TsType[] {
        if (schema.propertyNames === undefined) {
            return [stringType];
        }
        const names = this.#convert(schema.propertyNames, childPointer(pointer, 'propertyNames'), {
            properties: new Map(),
            types: ['string'],
            unguarded: [],
        });
        const members = names.kind === 'union' ? names.members : [names];
        return members.flatMap(member => {
            if (
                member.kind === 'template' ||
                (member.kind === 'literal' && typeof member.value === 'string')
            ) {
                return [member];
            }
            // Any other string type (e.g. an intersection of patterns) is as wide as `string`
            const isString =
                member.kind === 'intersection' ||
                (member.kind === 'keyword' &&
                    (member.keyword === 'string' || member.keyword === 'unknown'));
            return isString ? [stringType] : [];
        });
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
        const objectScope: Scope = { ...scope, types: ['object'] };
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

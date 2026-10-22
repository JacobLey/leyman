import { GeneverInvalidSchemaError, GeneverUnsupportedError } from './errors.js';
import { methods } from './openapi.js';
import { childPointer } from './pointer.js';
import { isSchemaObject } from './read-keyword.js';

/**
 * Base URI of a document without its own `$id`, read from nowhere in particular. Only used to resolve
 * references within the document, so any URI works, as long as relative `$id`s and `$ref`s resolve
 * against the same one.
 */
export const defaultBaseUri = 'https://genever.invalid/genever-document';

/**
 * Keywords whose value is a schema.
 */
export const schemaKeywords = [
    'additionalItems',
    'additionalProperties',
    'contains',
    'contentSchema',
    'else',
    'if',
    'items',
    'not',
    'propertyNames',
    'then',
    'unevaluatedItems',
    'unevaluatedProperties',
] as const;

/**
 * Keywords whose value is an array of schemas.
 */
export const schemaArrayKeywords = ['allOf', 'anyOf', 'items', 'oneOf', 'prefixItems'] as const;

/**
 * Keywords whose value is an object of schemas.
 */
export const schemaMapKeywords = [
    '$defs',
    'definitions',
    'dependencies',
    'dependentSchemas',
    'patternProperties',
    'properties',
] as const;

/**
 * `$schema` of draft-04, which names a schema's resource with `id` rather than `$id`.
 */
const draft04Schema = /^https?:\/\/json-schema\.org\/draft-04\/(?:hyper-)?schema#?$/v;

/**
 * Whether a schema declares itself draft-04 by its `$schema`, or `null` if it declares no dialect.
 *
 * @param schema - schema object
 * @returns whether the schema, and every schema it contains, is draft-04, or `null` to inherit its parent's
 */
export const declaresDraft04 = (schema: Readonly<Record<string, unknown>>): boolean | null =>
    typeof schema.$schema === 'string' ? draft04Schema.test(schema.$schema) : null;

/**
 * Keyword that names a schema's resource: `$id`, or `id` in draft-04.
 *
 * A draft-04 schema with an `$id` is a loaded file, which is given one to be embedded.
 *
 * @param schema - schema object
 * @param isDraft04 - whether the schema is draft-04
 * @returns `id` if the schema names its resource with it, else `$id`
 */
export const idKeywordOf = (
    schema: Readonly<Record<string, unknown>>,
    isDraft04: boolean
): '$id' | 'id' => (isDraft04 && schema.$id === undefined ? 'id' : '$id');

/**
 * Syntax of an `$anchor`, from JSON Schema 2020-12.
 */
const anchorName = /^[A-Z_a-z][\w\-.]*$/v;

/**
 * A schema found by a reference.
 */
export interface Target {
    /**
     * Canonical JSON Pointer to the schema, from the root of the document.
     */
    readonly pointer: string;
    readonly schema: unknown;
}

/**
 * Where every schema resource (`$id`) and anchor of a document is, and the base URI of every schema.
 *
 * A `$ref` resolves against the base URI of the schema it is in, which the nearest `$id` sets.
 * So in an embedded resource (a schema with its own `$id`), `#/$defs/A` is that resource's `$defs`,
 * not the document's.
 */
export interface DocumentIndex {
    /**
     * Base URI of each schema, keyed by its JSON Pointer.
     */
    readonly baseUris: ReadonlyMap<string, string>;
    /**
     * JSON Pointers of the schemas that are draft-04, by their own or a parent's `$schema`.
     */
    readonly draft04: ReadonlySet<string>;
    /**
     * Schemas named by `$anchor` (or `$dynamicAnchor`), keyed by base URI and anchor, e.g. `https://a.com/b.json#name`.
     */
    readonly anchors: ReadonlyMap<string, Target>;
    /**
     * URIs (without a fragment) of every `$ref`, resolved against the base URI of its schema,
     * with the JSON Pointer to the first `$ref` to each.
     */
    readonly references: ReadonlyMap<string, string>;
    /**
     * Schema resources, keyed by their URI (without a fragment).
     */
    readonly resources: ReadonlyMap<string, Target>;
}

/**
 * Resolve a URI reference, without its fragment.
 *
 * @param reference - URI reference, e.g. `./address.json`
 * @param baseUri - absolute URI to resolve it against
 * @returns absolute URI without a fragment, and the fragment (without `#`), or `null` if it isn't a URI reference
 */
const resolveUri = (
    reference: string,
    baseUri: string
): { fragment: string; uri: string } | null => {
    let url: URL;
    try {
        url = new URL(reference, baseUri);
    } catch {
        return null;
    }
    const fragment = url.hash.slice(1);
    url.hash = '';
    return { fragment, uri: url.href };
};

/**
 * Add a resource or anchor, unless another schema already declared it.
 *
 * @param map - resources or anchors
 * @param key - URI of the resource or anchor
 * @param target - schema that declares it
 * @param pointer - JSON Pointer to the declaring keyword, for errors
 * @throws {GeneverInvalidSchemaError} if another schema declared the same URI
 */
const addTarget = (
    map: Map<string, Target>,
    key: string,
    target: Target,
    pointer: string
): void => {
    const existing = map.get(key);
    if (existing && existing.pointer !== target.pointer) {
        throw new GeneverInvalidSchemaError(`"${key}" is already declared at ${existing.pointer}`, {
            pointer,
        });
    }
    map.set(key, target);
};

/**
 * Decode a URI fragment.
 *
 * @param fragment - percent-encoded fragment
 * @returns decoded fragment, or `null` if it is not valid percent-encoding
 */
const decodeFragment = (fragment: string): string | null => {
    try {
        return decodeURIComponent(fragment);
    } catch {
        return null;
    }
};

/**
 * Follow a JSON Pointer from a schema.
 *
 * @param target - schema the pointer starts at
 * @param pointer - JSON Pointer, e.g. `/$defs/A`, or empty for the schema itself
 * @returns the schema the pointer leads to, or `null` if there is nothing there
 */
const followPointer = (target: Target, pointer: string): Target | null => {
    let { pointer: targetPointer, schema } = target;
    const segments = pointer === '' ? [] : pointer.slice(1).split('/');
    for (const segment of segments) {
        const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
        if ((!isSchemaObject(schema) && !Array.isArray(schema)) || !Object.hasOwn(schema, key)) {
            return null;
        }
        targetPointer = childPointer(targetPointer, key);
        schema = (schema as Record<string, unknown>)[key];
    }
    return { pointer: targetPointer, schema };
};

class Indexer {
    readonly #anchors = new Map<string, Target>();
    readonly #baseUris = new Map<string, string>();
    readonly #draft04 = new Set<string>();
    readonly #references = new Map<string, string>();
    readonly #resources = new Map<string, Target>();

    /**
     * @param documentUri - URI identifying the document: its root `$id`, or a placeholder
     * @param root - root of the document, which is a resource even without an `$id`
     */
    public constructor(documentUri: string, root: unknown) {
        this.#baseUris.set('#', documentUri);
        this.#resources.set(documentUri, { pointer: '#', schema: root });
    }

    public get index(): DocumentIndex {
        return {
            anchors: this.#anchors,
            baseUris: this.#baseUris,
            draft04: this.#draft04,
            references: this.#references,
            resources: this.#resources,
        };
    }

    /**
     * Index a schema, and every schema it contains.
     *
     * @param schema - schema to index
     * @param pointer - JSON Pointer to the schema
     * @param parentBaseUri - base URI of the schema's parent
     * @param isParentDraft04 - whether the schema's parent is draft-04
     * @throws {GeneverInvalidSchemaError} if an identifier is invalid or declared twice
     */
    public visit(
        schema: unknown,
        pointer: string,
        parentBaseUri: string,
        isParentDraft04: boolean
    ): void {
        if (!isSchemaObject(schema)) {
            return;
        }
        const isDraft04 = declaresDraft04(schema) ?? isParentDraft04;
        if (isDraft04) {
            this.#draft04.add(pointer);
        }
        const baseUri = this.#identify(schema, pointer, parentBaseUri, isDraft04);
        this.#baseUris.set(pointer, baseUri);
        const reference = typeof schema.$ref === 'string' ? resolveUri(schema.$ref, baseUri) : null;
        if (reference && !this.#references.has(reference.uri)) {
            this.#references.set(reference.uri, childPointer(pointer, '$ref'));
        }

        for (const keyword of schemaKeywords) {
            this.visit(schema[keyword], childPointer(pointer, keyword), baseUri, isDraft04);
        }
        for (const keyword of schemaArrayKeywords) {
            const value = schema[keyword];
            if (!Array.isArray(value)) {
                continue;
            }
            const keywordPointer = childPointer(pointer, keyword);
            for (const [i, member] of value.entries()) {
                this.visit(member, childPointer(keywordPointer, i), baseUri, isDraft04);
            }
        }
        for (const keyword of schemaMapKeywords) {
            const value = schema[keyword];
            if (!isSchemaObject(value)) {
                continue;
            }
            const keywordPointer = childPointer(pointer, keyword);
            for (const [key, member] of Object.entries(value)) {
                this.visit(member, childPointer(keywordPointer, key), baseUri, isDraft04);
            }
        }
    }

    /**
     * Register the resource (`$id`) and anchors a schema declares.
     *
     * @param schema - schema object
     * @param pointer - JSON Pointer to the schema
     * @param parentBaseUri - base URI of the schema's parent
     * @param isDraft04 - whether the schema is draft-04, which names its resource with `id`
     * @returns base URI of the schema
     * @throws {GeneverInvalidSchemaError} if an identifier is invalid or declared twice
     */
    #identify(
        schema: Readonly<Record<string, unknown>>,
        pointer: string,
        parentBaseUri: string,
        isDraft04: boolean
    ): string {
        let baseUri = parentBaseUri;
        const idKeyword = idKeywordOf(schema, isDraft04);
        const $id = schema[idKeyword];
        const anchors: [string, unknown][] = [
            ['$anchor', schema.$anchor],
            ['$dynamicAnchor', schema.$dynamicAnchor],
        ];
        if ($id !== undefined) {
            const idPointer = childPointer(pointer, idKeyword);
            if (typeof $id === 'string' && $id.startsWith('#')) {
                // Draft 7 and earlier name a plain anchor with `$id`
                anchors.push([idKeyword, $id.slice(1)]);
            } else {
                const resolved = typeof $id === 'string' ? resolveUri($id, parentBaseUri) : null;
                if (resolved?.fragment !== '') {
                    throw new GeneverInvalidSchemaError(
                        `${idKeyword} must be a URI without a fragment`,
                        { pointer: idPointer }
                    );
                }
                baseUri = resolved.uri;
                addTarget(this.#resources, baseUri, { pointer, schema }, idPointer);
            }
        }
        for (const [keyword, anchor] of anchors) {
            if (anchor === undefined) {
                continue;
            }
            const anchorPointer = childPointer(pointer, keyword);
            if (typeof anchor !== 'string' || !anchorName.test(anchor)) {
                throw new GeneverInvalidSchemaError('Invalid anchor name', {
                    pointer: anchorPointer,
                });
            }
            addTarget(this.#anchors, `${baseUri}#${anchor}`, { pointer, schema }, anchorPointer);
        }
        return baseUri;
    }
}

/**
 * Find every schema resource and anchor of a document.
 *
 * @param root - the whole document, a resource itself even without an `$id`
 * @param schemas - schemas to search, with their JSON Pointers: the root schema, or an OpenAPI document's components
 * @param baseUri - URI the document was read from, which relative `$id`s and `$ref`s resolve against
 * @param [isDraft04] - whether the document is draft-04, without a `$schema` of its own
 * @returns resources, anchors and base URIs of the document's schemas
 * @throws {GeneverInvalidSchemaError} if an `$id` or anchor is invalid, or declared twice
 */
export const indexDocument = (
    root: unknown,
    schemas: readonly { pointer: string; schema: unknown }[],
    baseUri: string,
    isDraft04 = false
): DocumentIndex => {
    const rootId = isSchemaObject(root)
        ? root[idKeywordOf(root, declaresDraft04(root) ?? isDraft04)]
        : undefined;
    const documentUri =
        (typeof rootId === 'string' ? resolveUri(rootId, baseUri)?.uri : null) ?? baseUri;
    const indexer = new Indexer(documentUri, root);
    for (const { pointer, schema } of schemas) {
        indexer.visit(schema, pointer, documentUri, isDraft04);
    }
    return indexer.index;
};

/**
 * The nearest indexed schema at or above a pointer. A schema in a location no keyword makes a schema
 * (e.g. an extension) is not indexed, and has its nearest parent's base URI and dialect.
 *
 * @param index - index of the document
 * @param pointer - JSON Pointer to a schema
 * @returns JSON Pointer to the schema, or its nearest indexed parent
 */
const indexedAncestor = (index: DocumentIndex, pointer: string): string => {
    let ancestor = pointer;
    while (!index.baseUris.has(ancestor)) {
        ancestor = ancestor.slice(0, ancestor.lastIndexOf('/'));
    }
    return ancestor;
};

/**
 * Whether a schema is draft-04, by its own or a parent's `$schema`.
 *
 * @param index - index of the document
 * @param pointer - JSON Pointer to the schema
 * @returns true if the schema is draft-04
 */
export const isDraft04Schema = (index: DocumentIndex, pointer: string): boolean =>
    index.draft04.has(indexedAncestor(index, pointer));

/**
 * Resolve a `$ref`, against the base URI of the schema it is in.
 *
 * @param index - index of the document
 * @param ref - value of `$ref`
 * @param schemaPointer - JSON Pointer to the schema with the `$ref`
 * @returns the referenced schema
 * @throws {GeneverUnsupportedError} if the reference is to another document
 * @throws {GeneverInvalidSchemaError} if the reference is invalid, or does not resolve
 */
export const resolveReference = (
    index: DocumentIndex,
    ref: string,
    schemaPointer: string
): Target => {
    const refPointer = childPointer(schemaPointer, '$ref');
    const baseUri = index.baseUris.get(indexedAncestor(index, schemaPointer))!;
    const resolved = resolveUri(ref, baseUri);
    if (!resolved) {
        throw new GeneverInvalidSchemaError(`Invalid $ref "${ref}"`, { pointer: refPointer });
    }
    const resource = index.resources.get(resolved.uri);
    if (!resource) {
        throw new GeneverUnsupportedError(
            `Only references within the same document are supported, found "${ref}"`,
            { pointer: refPointer }
        );
    }

    const fragment = decodeFragment(resolved.fragment);
    if (fragment === null) {
        throw new GeneverInvalidSchemaError(`Invalid $ref "${ref}"`, { pointer: refPointer });
    }
    const target =
        fragment === '' || fragment.startsWith('/')
            ? followPointer(resource, fragment)
            : index.anchors.get(`${resolved.uri}#${fragment}`);
    if (!target) {
        throw new GeneverInvalidSchemaError(
            `$ref "${ref}" does not resolve to a schema in the document`,
            {
                pointer: refPointer,
            }
        );
    }
    return target;
};

/**
 * Resources a document refers to, but does not contain, such as other files.
 *
 * @param index - index of the document
 * @returns URIs of the resources, without fragments
 */
export const externalResources = (index: DocumentIndex): string[] =>
    index.references
        .keys()
        .filter(uri => !index.resources.has(uri))
        .toArray();

/**
 * Each member of an OpenAPI map or array, with its JSON Pointer.
 *
 * @param value - map, or array
 * @param pointer - JSON Pointer to it
 * @returns members, or none if it is neither
 */
const members = (value: unknown, pointer: string): Target[] =>
    isSchemaObject(value) || Array.isArray(value)
        ? Object.entries(value as Readonly<Record<string, unknown>>).map(([key, member]) => ({
              pointer: childPointer(pointer, key),
              schema: member,
          }))
        : [];

/**
 * An OpenAPI object, unless it is a reference object, which has no schemas of its own.
 *
 * @param value - OpenAPI object
 * @returns the object, or `null` if it is a reference object, or not an object
 */
const ownObject = (value: unknown): Readonly<Record<string, unknown>> | null =>
    isSchemaObject(value) && value.$ref === undefined ? value : null;

/**
 * The `schema` of a parameter, header or media type object, if it has one.
 *
 * @param target - the object, and its JSON Pointer
 * @returns its schema, with its JSON Pointer, or none
 */
const schemaOf = ({ pointer, schema: value }: Target): Target[] =>
    isSchemaObject(value) && value.schema !== undefined
        ? [{ pointer: childPointer(pointer, 'schema'), schema: value.schema }]
        : [];

/**
 * Schemas of a parameter, header, request body or response: its `schema`, the `schema` of each
 * `content` media type, and those of its `headers`.
 *
 * @param target - the object, and its JSON Pointer
 * @returns schemas, with their JSON Pointers
 */
const objectSchemas = ({ pointer, schema: value }: Target): Target[] => {
    const object = ownObject(value);
    if (!object) {
        return [];
    }
    const media = members(object.content, childPointer(pointer, 'content'));
    return [
        ...[{ pointer, schema: object }, ...media].flatMap(entry => schemaOf(entry)),
        ...members(object.headers, childPointer(pointer, 'headers')).flatMap(entry =>
            objectSchemas(entry)
        ),
    ];
};

/**
 * Schemas of a path item: those of its parameters, and of each operation's parameters, request body
 * and responses.
 *
 * @param target - the path item, and its JSON Pointer
 * @returns schemas, with their JSON Pointers
 */
const pathItemSchemas = ({ pointer, schema: value }: Target): Target[] => {
    const item = ownObject(value);
    if (!item) {
        return [];
    }
    const operations = methods.flatMap(method => {
        const operation = item[method];
        if (!isSchemaObject(operation)) {
            return [];
        }
        const operationPointer = childPointer(pointer, method);
        return [
            ...members(operation.parameters, childPointer(operationPointer, 'parameters')),
            {
                pointer: childPointer(operationPointer, 'requestBody'),
                schema: operation.requestBody,
            },
            ...members(operation.responses, childPointer(operationPointer, 'responses')),
        ];
    });
    return [
        ...members(item.parameters, childPointer(pointer, 'parameters')),
        ...operations,
    ].flatMap(entry => objectSchemas(entry));
};

/**
 * Schemas of an input: the schema itself, or each schema of an OpenAPI document, in its components
 * and its operations.
 *
 * @param input - JSON Schema, or OpenAPI document
 * @param isDocument - whether the input is an OpenAPI document
 * @returns schemas, with their JSON Pointers: an OpenAPI document's component schemas first
 */
export const inputSchemas = (input: unknown, isDocument: boolean): Target[] => {
    if (!isDocument) {
        return [{ pointer: '#', schema: input }];
    }
    // An OpenAPI document is always an object
    const { components, paths } = input as Readonly<Record<string, unknown>>;
    const component = (name: string): Target[] =>
        members(
            isSchemaObject(components) ? components[name] : undefined,
            childPointer(childPointer('#', 'components'), name)
        );
    return [
        ...component('schemas'),
        ...['parameters', 'headers', 'requestBodies', 'responses'].flatMap(name =>
            component(name).flatMap(entry => objectSchemas(entry))
        ),
        ...[...component('pathItems'), ...members(paths, childPointer('#', 'paths'))].flatMap(
            entry => pathItemSchemas(entry)
        ),
    ];
};

import type { Dialect } from './keywords.js';
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
     * Canonical JSON Pointer to the schema, from the root of the document, e.g. `#/$defs/A`.
     * In an {@link OpenApiFile}, it is preceded by the file's URI, e.g. `file:///api/common.yaml#/components/schemas/A`.
     */
    readonly pointer: string;
    readonly schema: unknown;
}

/**
 * An OpenAPI document, or a file of OpenAPI objects (e.g. responses), that the input refers to.
 * It is not a schema, so it is kept apart from the input, rather than embedded in it like a schema file.
 */
export interface OpenApiFile {
    /**
     * Flavour of its schemas: a document's own, or else that of the document that refers to it.
     */
    readonly dialect: Dialect;
    readonly document: unknown;
    /**
     * Its schemas that are used, with JSON Pointers from its root.
     */
    readonly schemas: readonly Target[];
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
     * Every `$ref`, resolved against the base URI of its schema (e.g. `https://a.com/b.json#/$defs/C`),
     * with the JSON Pointer to the first `$ref` to it.
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
export const resolveUri = (
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
 * Whether a decoded URI fragment is a JSON Pointer, rather than an anchor.
 *
 * @param fragment - decoded fragment, without `#`
 * @returns true if it is a JSON Pointer, including the empty one
 */
const isPointer = (fragment: string): boolean => fragment === '' || fragment.startsWith('/');

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
        const referenced = reference ? `${reference.uri}#${reference.fragment}` : null;
        if (referenced !== null && !this.#references.has(referenced)) {
            this.#references.set(referenced, childPointer(pointer, '$ref'));
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
     * Index the schemas of an OpenAPI file, which is a resource at its URI, as a schema file is.
     *
     * @param uri - URI of the file, which its schemas' references resolve against
     * @param file - document, and the schemas in it to index
     * @throws {GeneverInvalidSchemaError} if an identifier is invalid or declared twice
     */
    public visitFile(uri: string, file: OpenApiFile): void {
        const pointer = `${uri}#`;
        addTarget(this.#resources, uri, { pointer, schema: file.document }, pointer);
        this.#baseUris.set(pointer, uri);
        for (const { pointer: schemaPointer, schema } of file.schemas) {
            this.visit(schema, `${uri}${schemaPointer}`, uri, false);
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
 * @param options - where the document is from, and what else to index
 * @param options.baseUri - URI the document was read from, which relative `$id`s and `$ref`s resolve against
 * @param [options.isDraft04] - whether the document is draft-04, without a `$schema` of its own
 * @param [options.files] - OpenAPI files the document refers to, keyed by URI, whose schemas are indexed too
 * @returns resources, anchors and base URIs of the document's schemas
 * @throws {GeneverInvalidSchemaError} if an `$id` or anchor is invalid, or declared twice
 */
export const indexDocument = (
    root: unknown,
    schemas: readonly Target[],
    {
        baseUri,
        files = new Map(),
        isDraft04 = false,
    }: {
        baseUri: string;
        files?: ReadonlyMap<string, OpenApiFile>;
        isDraft04?: boolean;
    }
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
    for (const [uri, file] of files) {
        indexer.visitFile(uri, file);
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
    const target = isPointer(fragment)
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
 * What a URI fragment in a file points to.
 *
 * @param root - root of the file, and its JSON Pointer
 * @param fragment - percent-encoded fragment, without `#`
 * @returns the value, or `null` if the fragment is not a JSON Pointer, or there is nothing there
 */
export const locate = (root: Target, fragment: string): Target | null => {
    const decoded = decodeFragment(fragment);
    return decoded !== null && isPointer(decoded) ? followPointer(root, decoded) : null;
};

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
 * What a reference object refers to: a path item, or another OpenAPI object with schemas (a parameter,
 * header, request body or response).
 */
export type ObjectKind = 'object' | 'pathItem';

/**
 * A reference object: an OpenAPI object that is only a `$ref` to one elsewhere.
 */
export interface ObjectReference {
    readonly kind: ObjectKind;
    /**
     * JSON Pointer to the reference object.
     */
    readonly pointer: string;
    readonly ref: unknown;
}

/**
 * The schemas of OpenAPI objects, and the reference objects among them, which have none of their own.
 */
export interface OpenApiParts {
    readonly references: readonly ObjectReference[];
    readonly schemas: readonly Target[];
}

/**
 * Collect the schemas of an OpenAPI object, or the object itself if it is a schema.
 *
 * A parameter, header, request body or response has its `schema`, the `schema` of each `content` media
 * type, and those of its `headers`. A path item has those of its parameters, and of each operation's
 * parameters, request body and responses.
 *
 * @param target - the object, and its JSON Pointer
 * @param kind - what the object is
 * @param parts - schemas and reference objects found so far, which are added to
 */
const collectParts = (
    target: Target,
    kind: 'schema' | ObjectKind,
    parts: { references: ObjectReference[]; schemas: Target[] }
): void => {
    const { pointer, schema: value } = target;
    if (kind === 'schema') {
        if (value !== undefined) {
            parts.schemas.push(target);
        }
        return;
    }
    if (!isSchemaObject(value)) {
        return;
    }
    if (value.$ref !== undefined) {
        parts.references.push({ kind, pointer, ref: value.$ref });
        return;
    }
    const child = (key: string): Target => ({
        pointer: childPointer(pointer, key),
        schema: value[key],
    });
    if (kind === 'pathItem') {
        const parameters = members(value.parameters, childPointer(pointer, 'parameters'));
        for (const parameter of parameters) {
            collectParts(parameter, 'object', parts);
        }
        for (const method of methods) {
            const operation = child(method);
            if (!isSchemaObject(operation.schema)) {
                continue;
            }
            const { pointer: operationPointer, schema: operationObject } = operation;
            const objects = [
                ...members(
                    operationObject.parameters,
                    childPointer(operationPointer, 'parameters')
                ),
                {
                    pointer: childPointer(operationPointer, 'requestBody'),
                    schema: operationObject.requestBody,
                },
                ...members(operationObject.responses, childPointer(operationPointer, 'responses')),
            ];
            for (const object of objects) {
                collectParts(object, 'object', parts);
            }
        }
        return;
    }
    collectParts(child('schema'), 'schema', parts);
    const contents = members(value.content, childPointer(pointer, 'content'));
    for (const media of contents) {
        if (isSchemaObject(media.schema)) {
            collectParts(
                { pointer: childPointer(media.pointer, 'schema'), schema: media.schema.schema },
                'schema',
                parts
            );
        }
    }
    const headers = members(value.headers, childPointer(pointer, 'headers'));
    for (const header of headers) {
        collectParts(header, 'object', parts);
    }
};

/**
 * The schemas of an OpenAPI object, and the reference objects in it.
 *
 * @param target - the object, and its JSON Pointer
 * @param kind - what the object is: a schema is its own only schema
 * @returns schemas and reference objects, with their JSON Pointers
 */
export const objectParts = (target: Target, kind: 'schema' | ObjectKind): OpenApiParts => {
    const parts: { references: ObjectReference[]; schemas: Target[] } = {
        references: [],
        schemas: [],
    };
    collectParts(target, kind, parts);
    return parts;
};

/**
 * The schemas of an OpenAPI document, in its components and its operations, and the reference objects in it.
 *
 * @param document - OpenAPI document
 * @param shouldIncludePaths - whether to include its `paths`, which only the input's operations need
 * @returns schemas and reference objects, with their JSON Pointers: component schemas first
 */
export const documentParts = (document: unknown, shouldIncludePaths: boolean): OpenApiParts => {
    // An OpenAPI document is always an object
    const { components, paths } = document as Readonly<Record<string, unknown>>;
    const component = (name: string): Target[] =>
        members(
            isSchemaObject(components) ? components[name] : undefined,
            childPointer(childPointer('#', 'components'), name)
        );
    const parts: { references: ObjectReference[]; schemas: Target[] } = {
        references: [],
        schemas: [],
    };
    for (const schema of component('schemas')) {
        collectParts(schema, 'schema', parts);
    }
    for (const name of ['parameters', 'headers', 'requestBodies', 'responses']) {
        for (const object of component(name)) {
            collectParts(object, 'object', parts);
        }
    }
    for (const item of [
        ...component('pathItems'),
        ...(shouldIncludePaths ? members(paths, childPointer('#', 'paths')) : []),
    ]) {
        collectParts(item, 'pathItem', parts);
    }
    return parts;
};

/**
 * Schemas of an input: the schema itself, or each schema of an OpenAPI document, in its components
 * and its operations.
 *
 * @param input - JSON Schema, or OpenAPI document
 * @param isDocument - whether the input is an OpenAPI document
 * @returns schemas, with their JSON Pointers: an OpenAPI document's component schemas first
 */
export const inputSchemas = (input: unknown, isDocument: boolean): readonly Target[] =>
    isDocument ? documentParts(input, true).schemas : [{ pointer: '#', schema: input }];

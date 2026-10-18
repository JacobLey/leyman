import { DecantInvalidSchemaError, DecantUnsupportedError } from './errors.js';
import { childPointer } from './pointer.js';
import { isSchemaObject } from './read-keyword.js';

/**
 * Base URI of a document without its own `$id`. Only used to resolve references within the document,
 * so any URI works, as long as relative `$id`s and `$ref`s resolve against the same one.
 */
const defaultBaseUri = 'https://decant.invalid/decant-document';

/**
 * Keywords whose value is a schema.
 */
const schemaKeywords = [
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
const schemaArrayKeywords = ['allOf', 'anyOf', 'items', 'oneOf', 'prefixItems'] as const;

/**
 * Keywords whose value is an object of schemas.
 */
const schemaMapKeywords = [
    '$defs',
    'definitions',
    'dependencies',
    'dependentSchemas',
    'patternProperties',
    'properties',
] as const;

/**
 * Syntax of an `$anchor`, from JSON Schema 2020-12.
 */
const anchorName = /^[A-Z_a-z][\w.-]*$/u;

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
     * Schemas named by `$anchor` (or `$dynamicAnchor`), keyed by base URI and anchor, e.g. `https://a.com/b.json#name`.
     */
    readonly anchors: ReadonlyMap<string, Target>;
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
 * @throws {DecantInvalidSchemaError} if another schema declared the same URI
 */
const addTarget = (
    map: Map<string, Target>,
    key: string,
    target: Target,
    pointer: string
): void => {
    const existing = map.get(key);
    if (existing && existing.pointer !== target.pointer) {
        throw new DecantInvalidSchemaError(`"${key}" is already declared at ${existing.pointer}`, {
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
            resources: this.#resources,
        };
    }

    public visit(schema: unknown, pointer: string, parentBaseUri: string): void {
        if (!isSchemaObject(schema)) {
            return;
        }
        const baseUri = this.#identify(schema, pointer, parentBaseUri);
        this.#baseUris.set(pointer, baseUri);

        for (const keyword of schemaKeywords) {
            this.visit(schema[keyword], childPointer(pointer, keyword), baseUri);
        }
        for (const keyword of schemaArrayKeywords) {
            const value = schema[keyword];
            if (!Array.isArray(value)) {
                continue;
            }
            const keywordPointer = childPointer(pointer, keyword);
            for (const [i, member] of value.entries()) {
                this.visit(member, childPointer(keywordPointer, i), baseUri);
            }
        }
        for (const keyword of schemaMapKeywords) {
            const value = schema[keyword];
            if (!isSchemaObject(value)) {
                continue;
            }
            const keywordPointer = childPointer(pointer, keyword);
            for (const [key, member] of Object.entries(value)) {
                this.visit(member, childPointer(keywordPointer, key), baseUri);
            }
        }
    }

    /**
     * Register the resource (`$id`) and anchors a schema declares.
     *
     * @param schema - schema object
     * @param pointer - JSON Pointer to the schema
     * @param parentBaseUri - base URI of the schema's parent
     * @returns base URI of the schema
     * @throws {DecantInvalidSchemaError} if an identifier is invalid or declared twice
     */
    #identify(
        schema: Readonly<Record<string, unknown>>,
        pointer: string,
        parentBaseUri: string
    ): string {
        let baseUri = parentBaseUri;
        const { $id } = schema;
        const anchors: [string, unknown][] = [
            ['$anchor', schema.$anchor],
            ['$dynamicAnchor', schema.$dynamicAnchor],
        ];
        if ($id !== undefined) {
            const idPointer = childPointer(pointer, '$id');
            if (typeof $id === 'string' && $id.startsWith('#')) {
                // Draft 7 and earlier name a plain anchor with `$id`
                anchors.push(['$id', $id.slice(1)]);
            } else {
                const resolved = typeof $id === 'string' ? resolveUri($id, parentBaseUri) : null;
                if (resolved?.fragment !== '') {
                    throw new DecantInvalidSchemaError('$id must be a URI without a fragment', {
                        pointer: idPointer,
                    });
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
                throw new DecantInvalidSchemaError('Invalid anchor name', {
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
 * @returns resources, anchors and base URIs of the document's schemas
 * @throws {DecantInvalidSchemaError} if an `$id` or anchor is invalid, or declared twice
 */
export const indexDocument = (
    root: unknown,
    schemas: readonly { pointer: string; schema: unknown }[]
): DocumentIndex => {
    const rootId = isSchemaObject(root) && typeof root.$id === 'string' ? root.$id : null;
    const documentUri =
        (rootId === null ? null : resolveUri(rootId, defaultBaseUri)?.uri) ?? defaultBaseUri;
    const indexer = new Indexer(documentUri, root);
    for (const { pointer, schema } of schemas) {
        indexer.visit(schema, pointer, documentUri);
    }
    return indexer.index;
};

/**
 * Resolve a `$ref`, against the base URI of the schema it is in.
 *
 * @param index - index of the document
 * @param ref - value of `$ref`
 * @param schemaPointer - JSON Pointer to the schema with the `$ref`
 * @returns the referenced schema
 * @throws {DecantUnsupportedError} if the reference is to another document
 * @throws {DecantInvalidSchemaError} if the reference is invalid, or does not resolve
 */
export const resolveReference = (
    index: DocumentIndex,
    ref: string,
    schemaPointer: string
): Target => {
    const refPointer = childPointer(schemaPointer, '$ref');
    // A schema in a location no keyword makes a schema (e.g. an extension) has its nearest parent's base URI
    let ancestor = schemaPointer;
    while (!index.baseUris.has(ancestor)) {
        ancestor = ancestor.slice(0, ancestor.lastIndexOf('/'));
    }
    const baseUri = index.baseUris.get(ancestor)!;
    const resolved = resolveUri(ref, baseUri);
    if (!resolved) {
        throw new DecantInvalidSchemaError(`Invalid $ref "${ref}"`, { pointer: refPointer });
    }
    const resource = index.resources.get(resolved.uri);
    if (!resource) {
        throw new DecantUnsupportedError(
            `Only references within the same document are supported, found "${ref}"`,
            { pointer: refPointer }
        );
    }

    const fragment = decodeFragment(resolved.fragment);
    if (fragment === null) {
        throw new DecantInvalidSchemaError(`Invalid $ref "${ref}"`, { pointer: refPointer });
    }
    const target =
        fragment === '' || fragment.startsWith('/')
            ? followPointer(resource, fragment)
            : index.anchors.get(`${resolved.uri}#${fragment}`);
    if (!target) {
        throw new DecantInvalidSchemaError(
            `$ref "${ref}" does not resolve to a schema in the document`,
            {
                pointer: refPointer,
            }
        );
    }
    return target;
};

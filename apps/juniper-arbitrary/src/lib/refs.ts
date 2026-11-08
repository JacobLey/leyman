import type { SchemaNode } from './flatten.js';

/**
 * The base URI of a root schema without an `$id`. The specification leaves it to the
 * implementation (https://json-schema.org/draft/2020-12/json-schema-core#section-9.1.1): this only
 * has to resolve relative `$id`s and `$ref`s against the same thing, so they meet.
 */
const placeholderBase = 'https://juniper-arbitrary.invalid/root.json';

/**
 * Keywords whose values are data, not schemas, so an `$id` inside them identifies nothing.
 */
const dataKeywords = new Set([
    'const',
    'default',
    'enum',
    'examples',
    'required',
    'dependentRequired',
]);

/**
 * Keywords holding a list of schemas.
 */
const listKeywords = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems', 'items']);

/**
 * Keywords holding schemas by name.
 */
const mapKeywords = new Set([
    '$defs',
    'definitions',
    'dependentSchemas',
    'patternProperties',
    'properties',
]);

/**
 * `$anchor` and `$dynamicAnchor` names (https://json-schema.org/draft/2020-12/json-schema-core#section-8.2.2).
 */
const anchorName = /^[A-Z_a-z][\w\-.]*$/v;

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Resolve a URI reference against a base.
 *
 * @param reference - `$id` or `$ref`
 * @param base - absolute URI it's relative to
 * @returns absolute URI, or null if it isn't one
 */
const resolveUri = (reference: string, base: string): URL | null => {
    try {
        return new URL(reference, base);
    } catch {
        return null;
    }
};

/**
 * A URI without its fragment, which is what identifies a schema resource.
 *
 * @param url - absolute URI
 * @returns it, without the fragment
 */
const withoutFragment = (url: URL): string => url.href.split('#', 1)[0]!;

/**
 * A schema `$ref` resolves to, and the URI that identifies it.
 */
export interface ResolvedRef {
    readonly node: SchemaNode;
    readonly uri: string;
}

/**
 * The schema resources and anchors in a root schema, for resolving `$ref`s the way JSON Schema
 * 2020-12 does (https://json-schema.org/draft/2020-12/json-schema-core#section-8.2): an `$id`
 * sets the base URI of its subschema, resolved against the base around it, and a `$ref` is
 * resolved against the base it sits in, then its fragment is followed as a JSON pointer within
 * that resource or as an anchor's name.
 *
 * Schemas are told apart by identity, so the root shouldn't hold the same object in two places
 * with different bases.
 */
export class SchemaIndex {
    /**
     * The base of the root, which a schema not in it (built by combining others) is also given.
     */
    public readonly rootBase: string;
    readonly #bases = new WeakMap<object, string>();
    readonly #resources = new Map<string, SchemaNode>();
    readonly #anchors = new Map<string, SchemaNode>();

    public constructor(root: SchemaNode) {
        this.#resources.set(placeholderBase, root);
        this.#index(root, placeholderBase);
        this.rootBase = this.baseOf(root, placeholderBase);
    }

    /**
     * The base URI a schema's own keywords are resolved against, its own `$id` applied.
     *
     * @param node - schema, possibly in the root
     * @param inherited - base around it, for a schema not in the root
     * @returns absolute URI without a fragment
     */
    public baseOf(node: SchemaNode, inherited: string = this.rootBase): string {
        return (typeof node === 'object' ? this.#bases.get(node) : undefined) ?? inherited;
    }

    /**
     * A key that tells schemas apart by content and by the base they're resolved against, since
     * the same `$ref` means something else in another resource. Their JSON for a schema with no
     * `$id` in or around it.
     *
     * @param node - schema, possibly in the root
     * @returns JSON, with the base of each object whose base isn't the root's
     */
    public keyOf(node: SchemaNode): string {
        return JSON.stringify(node, (_key, value: unknown) => {
            if (!isObject(value)) {
                return value;
            }
            const base = this.#bases.get(value);
            return base === undefined || base === this.rootBase ? value : { '': base, ...value };
        });
    }

    /**
     * Resolve a `$ref`.
     *
     * @param ref - `$ref` value
     * @param base - base URI it sits in
     * @returns the schema it refers to, or null if it isn't in the root
     */
    public resolve(ref: string, base: string): ResolvedRef | null {
        const url = resolveUri(ref, base);
        if (!url) {
            return null;
        }
        const resource = this.#resources.get(withoutFragment(url));
        if (resource === undefined) {
            return null;
        }
        const fragment = url.hash.slice(1);
        if (fragment === '') {
            return { node: resource, uri: url.href };
        }
        if (!fragment.startsWith('/')) {
            const node = this.#anchors.get(`${withoutFragment(url)}#${fragment}`);
            return node === undefined ? null : { node, uri: url.href };
        }
        let current: unknown = resource;
        try {
            for (const segment of fragment.split('/').slice(1)) {
                const key = decodeURIComponent(segment).replaceAll('~1', '/').replaceAll('~0', '~');
                current = (current as Readonly<Record<string, unknown>> | undefined)?.[key];
            }
        } catch {
            // A malformed percent-encoding
            return null;
        }
        // The validator compiled the schema, so whatever the pointer reaches is a schema
        return current === undefined ? null : { node: current as SchemaNode, uri: url.href };
    }

    #index(node: unknown, inherited: string): void {
        if (!isObject(node)) {
            return;
        }
        let base = inherited;
        // An `$id` has no fragment besides an empty one (https://json-schema.org/draft/2020-12/json-schema-core#section-8.2.1)
        const idUrl = typeof node.$id === 'string' ? resolveUri(node.$id, inherited) : null;
        if (idUrl?.hash === '') {
            base = withoutFragment(idUrl);
            if (!this.#resources.has(base)) {
                this.#resources.set(base, node);
            }
        }
        this.#bases.set(node, base);
        for (const keyword of ['$anchor', '$dynamicAnchor']) {
            const anchor = node[keyword];
            if (typeof anchor === 'string' && anchorName.test(anchor)) {
                this.#anchors.set(`${base}#${anchor}`, node);
            }
        }
        for (const [keyword, value] of Object.entries(node)) {
            if (dataKeywords.has(keyword)) {
                continue;
            }
            if (listKeywords.has(keyword) && Array.isArray(value)) {
                for (const child of value) {
                    this.#index(child, base);
                }
            } else if (mapKeywords.has(keyword) && isObject(value)) {
                for (const child of Object.values(value)) {
                    this.#index(child, base);
                }
            } else {
                // Any other object is taken for a schema, as Ajv does
                this.#index(value, base);
            }
        }
    }
}

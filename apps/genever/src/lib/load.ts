import type { HostFilter } from './hosts.js';
import type { Dialect } from './keywords.js';
import type { SchemaObject } from './read-keyword.js';
import type {
    DocumentIndex,
    ObjectKind,
    ObjectReference,
    OpenApiFile,
    OpenApiParts,
    Target,
} from './resources.js';
import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GeneverLoadError } from './errors.js';
import { hostFilter } from './hosts.js';
import { openApiDialect } from './openapi.js';
import { isYaml, parseText } from './parse.js';
import { childPointer } from './pointer.js';
import { isSchemaObject } from './read-keyword.js';
import {
    declaresDraft04,
    documentParts,
    idKeywordOf,
    indexDocument,
    inputSchemas,
    locate,
    objectParts,
    resolveUri,
} from './resources.js';

export interface LoadOptions {
    /**
     * URI the input was read from, which relative references resolve against.
     */
    readonly baseUri: string;
    /**
     * Flavour of the input's schemas, which a file of OpenAPI objects it refers to has too.
     */
    readonly dialect: Dialect;
    /**
     * Load `http:` and `https:` URLs, or only those of these hosts. Otherwise only files are loaded.
     */
    readonly fetch: boolean | readonly string[];
    /**
     * Whether the input is an OpenAPI document.
     */
    readonly isDocument: boolean;
    /**
     * Called with the text of each file or URL read, e.g. to record hashes of the inputs.
     */
    readonly onRead?: (uri: string, text: string) => void;
}

/**
 * A schema loaded from another file or URL, to embed in the input.
 */
interface LoadedResource {
    /**
     * Index of the schema, by its own URIs.
     */
    readonly index: DocumentIndex;
    /**
     * Schemas to embed: the schema, with an absolute `$id`, and if its `$id` is not the URI it was
     * loaded from, an alias at that URI.
     */
    readonly schemas: readonly SchemaObject[];
}

/**
 * Why a resource can't be loaded.
 */
interface Unloadable {
    /**
     * Underlying error, e.g. the file system's or the parser's, if there was one.
     */
    readonly cause?: unknown;
    readonly reason: string;
}

/**
 * A `$ref` to load, or to find more references from.
 */
interface Reference {
    /**
     * Fragment of the URI, without `#`.
     */
    readonly fragment: string;
    /**
     * What it refers to: a schema, or an OpenAPI object (in a reference object).
     */
    readonly kind: 'schema' | ObjectKind;
    readonly pointer: string;
    /**
     * URI of the file or URL the `$ref` is in.
     */
    readonly referencedFrom: string;
    /**
     * URI it refers to, without the fragment.
     */
    readonly uri: string;
}

/**
 * A resource that failed to load, and the `$ref` that needed it.
 */
interface Failure extends Unloadable, Omit<Reference, 'fragment' | 'kind'> {}

/**
 * An OpenAPI file being loaded.
 */
interface LoadingFile extends OpenApiFile {
    readonly schemas: Target[];
    /**
     * Objects whose schemas have been found, by kind and JSON Pointer.
     */
    readonly walked: Set<string>;
}

/**
 * The input, and every file and URL it references.
 */
export interface Bundle {
    /**
     * The input, with every schema it references embedded.
     */
    readonly input: unknown;
    /**
     * OpenAPI documents, and files of OpenAPI objects, the input references, keyed by URI.
     */
    readonly files: ReadonlyMap<string, OpenApiFile>;
}

// eslint-disable-next-line @typescript-eslint/no-magic-numbers -- the HTTP statuses that redirect
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

/**
 * As many redirects as `fetch` follows.
 */
const maxRedirects = 20;

/**
 * Fetch a URL, following redirects only to hosts that are allowed.
 *
 * @param uri - absolute `http:` or `https:` URL
 * @param isAllowed - hosts that may be fetched
 * @returns the response, and the URL it is from after redirects, or why it can't be fetched
 */
const fetchAllowed = async (
    uri: string,
    isAllowed: HostFilter
): Promise<Unloadable | { response: Response; url: URL }> => {
    let url = new URL(uri);
    for (let redirects = 0; redirects <= maxRedirects; redirects++) {
        if (!isAllowed(url)) {
            return { reason: `${url.host} is not an allowed host` };
        }
        const response = await globalThis.fetch(url, {
            headers: {
                accept: 'application/schema+json, application/json, application/yaml;q=0.9',
            },
            redirect: 'manual',
        });
        const location = response.headers.get('location');
        if (location === null || !redirectStatuses.has(response.status)) {
            return { response, url };
        }
        url = new URL(location, url);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return { reason: `redirected to a ${url.protocol} URI` };
        }
    }
    return { reason: 'too many redirects' };
};

/**
 * Read the text of a file or URL.
 *
 * @param uri - absolute URI, without a fragment
 * @param isAllowed - hosts that may be fetched, or null to load only files
 * @returns the text, the URI it is from after redirects, and whether it is YAML, or why it can't be read
 */
const readText = async (
    uri: string,
    isAllowed: HostFilter | null
): Promise<Unloadable | { text: string; uri: string; yaml: boolean }> => {
    const { protocol } = new URL(uri);
    try {
        if (protocol === 'file:') {
            return { uri, text: await readFile(fileURLToPath(uri), 'utf8'), yaml: isYaml(uri) };
        }
        if (protocol !== 'http:' && protocol !== 'https:') {
            return { reason: `${protocol} URIs can't be loaded` };
        }
        if (!isAllowed) {
            return { reason: 'loading URLs is disabled' };
        }
        const fetched = await fetchAllowed(uri, isAllowed);
        if ('reason' in fetched) {
            return fetched;
        }
        const { response, url } = fetched;
        return response.ok
            ? {
                  text: await response.text(),
                  uri: url.href,
                  yaml: isYaml(url.href, response.headers.get('content-type')),
              }
            : { reason: `HTTP ${response.status}` };
    } catch (error) {
        return { cause: error, reason: String(error) };
    }
};

/**
 * Read and parse a file or URL.
 *
 * @param uri - absolute URI, without a fragment
 * @param isAllowed - hosts that may be fetched, or null to load only files
 * @param onRead - called with the text, once read
 * @returns the parsed value, and the URI it is from after redirects, or why it can't be loaded
 */
const readResource = async (
    uri: string,
    isAllowed: HostFilter | null,
    onRead: LoadOptions['onRead']
): Promise<Unloadable | { parsed: unknown; uri: string }> => {
    const read = await readText(uri, isAllowed);
    if ('reason' in read) {
        return read;
    }
    onRead?.(uri, read.text);
    try {
        return { parsed: parseText(read.text, read.yaml), uri: read.uri };
    } catch (error) {
        return {
            cause: error,
            reason: read.yaml ? `not valid YAML: ${(error as Error).message}` : 'not valid JSON',
        };
    }
};

/**
 * Make a loaded schema a resource, and index it.
 *
 * Its `$id`, if any, is its base URI. Otherwise the URI it was read from, after redirects, is
 * ([RFC 3986](https://www.rfc-editor.org/rfc/rfc3986#section-5.1.3)), which it is given as its `$id`,
 * so it can be embedded in another document, and still resolve its own references.
 *
 * @param parsed - parsed file
 * @param uri - URI it was referenced by
 * @param readUri - URI it was read from, after redirects
 * @param isInputDraft04 - whether the input is draft-04, which a file without a `$schema` is too
 * @returns the resource, or why it isn't one
 */
const schemaResource = (
    parsed: unknown,
    uri: string,
    readUri: string,
    isInputDraft04: boolean
): LoadedResource | Unloadable => {
    if (typeof parsed === 'boolean') {
        return schemaResource(parsed ? {} : { not: {} }, uri, readUri, isInputDraft04);
    }
    if (!isSchemaObject(parsed)) {
        return { reason: 'not a schema' };
    }
    // A file without a `$schema` is read in the input's dialect
    const isDraft04 = declaresDraft04(parsed) ?? isInputDraft04;
    const $id = parsed[idKeywordOf(parsed, isDraft04)];
    const schema: SchemaObject =
        // Draft 7 names a plain anchor with `$id`, which can't name the schema's resource
        typeof $id === 'string' && $id.startsWith('#')
            ? { ...parsed, $id: readUri, $anchor: $id.slice(1) }
            : { ...parsed, $id: $id ?? readUri };
    const index = indexDocument(schema, inputSchemas(schema, false), {
        baseUri: readUri,
        isDraft04,
    });
    // The `$id` of a schema may be relative to where it was loaded from
    const id = index.baseUris.get('#')!;
    return {
        index,
        schemas: [{ ...schema, $id: id }, ...(id === uri ? [] : [{ $id: uri, $ref: id }])],
    };
};

/**
 * Name of an embedded resource, which names its type: its `title`, else its file name.
 *
 * @param resource - schema with an absolute `$id`
 * @param taken - names already used in the container
 * @returns unique name
 */
const resourceName = (resource: SchemaObject, taken: ReadonlySet<string>): string => {
    const url = new URL(resource.$id as string);
    const [fileName = ''] = Path.posix.basename(url.pathname).split('.', 1);
    let base = fileName === '' ? 'Schema' : fileName;
    if (typeof resource.title === 'string') {
        base = resource.title;
    }
    let name = base;
    let suffix = 1;
    while (taken.has(name)) {
        suffix++;
        name = `${base} ${suffix}`;
    }
    return name;
};

/**
 * Add embedded resources to an input: the root schema's `$defs`, or an OpenAPI document's components.
 *
 * @param input - JSON Schema, or OpenAPI document
 * @param resources - schemas with absolute `$id`s
 * @param isDocument - whether the input is an OpenAPI document
 * @returns a copy of the input, with the resources
 */
const embed = (
    input: SchemaObject,
    resources: readonly SchemaObject[],
    isDocument: boolean
): SchemaObject => {
    const components = (isDocument ? input.components : null) as SchemaObject | null;
    const container = ((components ? components.schemas : input.$defs) ?? {}) as SchemaObject;
    const taken = new Set(Object.keys(container));
    const added: Record<string, SchemaObject> = {};
    for (const resource of resources) {
        const name = resourceName(resource, taken);
        taken.add(name);
        added[name] = resource;
    }
    const merged = { ...container, ...added };
    return components
        ? { ...input, components: { ...components, schemas: merged } }
        : { ...input, $defs: merged };
};

/**
 * Load every file and URL an input references, and everything they reference in turn.
 *
 * Loaded schemas are embedded in the input with an absolute `$id`, in `$defs` (or an OpenAPI document's
 * `components.schemas`), named after their `title`, or else their file name. References are left as
 * they are, and resolve to the embedded schemas by URI, as in the bundling process of JSON Schema 2020-12.
 *
 * Other OpenAPI documents, and files of OpenAPI objects (e.g. `responses.yaml#/NotFound` from a response),
 * are not schemas, so they aren't embedded: they're returned beside the input, with the schemas in them that
 * are used. A loaded document's schemas are those of its components, and of anything else referenced in it.
 *
 * @param input - JSON Schema, or OpenAPI document
 * @param options - how to read the input, and what to load
 * @returns the input with every referenced schema embedded (or the input itself if it references none), and the OpenAPI files it references
 * @rejects {GeneverLoadError} if a referenced file or URL can't be loaded
 * @rejects {TypeError} if an allowed host is not a host
 */
export const loadReferences = async (input: unknown, options: LoadOptions): Promise<Bundle> => {
    const isAllowed = hostFilter(options.fetch);
    const isInputDraft04 =
        !options.isDocument && isSchemaObject(input) && declaresDraft04(input) === true;
    const known = new Set<string>();
    const attempted = new Set<string>();
    const resources: SchemaObject[] = [];
    const files = new Map<string, LoadingFile>();
    const failures: Failure[] = [];
    /**
     * References still to load, as a stack: the last is next. Each is pushed in reverse,
     * so references load in the order they appear, each followed by what it refers to.
     */
    const pending: Reference[] = [];

    /**
     * Queue the references of schemas, and of reference objects, found in a file.
     *
     * @param index - index of the schemas found
     * @param objectReferences - reference objects found
     * @param referencedFrom - URI of the file, which reference objects resolve against
     */
    const queueReferences = (
        index: DocumentIndex,
        objectReferences: readonly ObjectReference[],
        referencedFrom: string
    ): void => {
        for (const resource of index.resources.keys()) {
            known.add(resource);
        }
        const references: Reference[] = index.references
            .entries()
            .map(([reference, pointer]) => {
                const hash = reference.indexOf('#');
                return {
                    fragment: reference.slice(hash + 1),
                    kind: 'schema' as const,
                    uri: reference.slice(0, hash),
                    pointer,
                    referencedFrom,
                };
            })
            .toArray();
        for (const { kind, pointer, ref } of objectReferences) {
            // An invalid reference object is reported where it's used
            const resolved = typeof ref === 'string' ? resolveUri(ref, referencedFrom) : null;
            if (resolved) {
                references.push({
                    ...resolved,
                    kind,
                    pointer: childPointer(pointer, '$ref'),
                    referencedFrom,
                });
            }
        }
        pending.push(...references.toReversed());
    };

    /**
     * Find the schemas of objects in an OpenAPI file, and queue their references.
     *
     * @param uri - URI of the file, which its references resolve against
     * @param file - file the parts are in, which the new schemas are added to
     * @param parts - schemas and reference objects found in it
     */
    const addParts = (uri: string, file: LoadingFile, parts: OpenApiParts): void => {
        // A schema in one already found is indexed with it, under the right base URI
        const schemas = parts.schemas.filter(({ pointer }) =>
            file.schemas.every(
                found => pointer !== found.pointer && !pointer.startsWith(`${found.pointer}/`)
            )
        );
        file.schemas.push(...schemas);
        queueReferences(
            indexDocument(file.document, schemas, { baseUri: uri }),
            parts.references,
            uri
        );
    };

    /**
     * Find the schemas of the object a reference refers to in an OpenAPI file.
     *
     * @param file - file the reference is into
     * @param reference - reference to an object in it, and what kind of object
     */
    const walk = (file: LoadingFile, { fragment, kind, uri }: Reference): void => {
        // A reference to nothing, or to an anchor, is reported where it's used, if it doesn't resolve
        const target = locate({ pointer: '#', schema: file.document }, fragment);
        if (!target || file.walked.has(`${kind} ${target.pointer}`)) {
            return;
        }
        file.walked.add(`${kind} ${target.pointer}`);
        addParts(uri, file, objectParts(target, kind));
    };

    const load = async (reference: Reference): Promise<void> => {
        const { kind, pointer, referencedFrom, uri } = reference;
        const fail = (unloadable: Unloadable): void => {
            failures.push({ ...unloadable, pointer, referencedFrom, uri });
        };
        const read = await readResource(uri, isAllowed, options.onRead);
        if ('reason' in read) {
            fail(read);
            return;
        }
        let dialect: Dialect | null;
        try {
            dialect = openApiDialect(read.parsed);
        } catch (error) {
            fail({ cause: error, reason: (error as Error).message });
            return;
        }
        if (dialect !== null || kind !== 'schema') {
            // Its references resolve against the URI it was referenced by, even if redirected, so it has one URI
            const file: LoadingFile = {
                dialect: dialect ?? files.get(referencedFrom)?.dialect ?? options.dialect,
                document: read.parsed,
                schemas: [],
                walked: new Set(),
            };
            files.set(uri, file);
            known.add(uri);
            if (dialect !== null) {
                addParts(uri, file, documentParts(read.parsed, false));
            }
            walk(file, reference);
            return;
        }
        const loaded = schemaResource(read.parsed, uri, read.uri, isInputDraft04);
        if ('reason' in loaded) {
            fail(loaded);
            return;
        }
        resources.push(...loaded.schemas);
        // Referred to by its URL, even if its `$id` is another
        known.add(uri);
        queueReferences(loaded.index, [], uri);
    };

    const inputParts = options.isDocument
        ? documentParts(input, true)
        : { references: [], schemas: inputSchemas(input, false) };
    queueReferences(
        indexDocument(input, inputParts.schemas, { baseUri: options.baseUri }),
        inputParts.references,
        options.baseUri
    );
    while (pending.length > 0) {
        const reference = pending.pop()!;
        const file = files.get(reference.uri);
        if (file) {
            walk(file, reference);
        } else if (!known.has(reference.uri) && !attempted.has(reference.uri)) {
            attempted.add(reference.uri);
            await load(reference);
        }
    }

    // A resource may fail to load from its URI, but be declared by `$id` in another loaded schema
    const failure = failures.find(({ uri }) => !known.has(uri));
    if (failure) {
        const { pointer, reason, referencedFrom, uri } = failure;
        // Other errors' pointers are into the input, so name the file only when it's another
        const from =
            referencedFrom === options.baseUri ? '' : `, referenced from "${referencedFrom}"`;
        throw new GeneverLoadError(`Could not load "${uri}"${from}: ${reason}`, {
            ...('cause' in failure && { cause: failure.cause }),
            pointer,
            referencedFrom,
        });
    }
    return {
        files: new Map(
            files
                .entries()
                .map(([uri, { dialect, document, schemas }]) => [
                    uri,
                    { dialect, document, schemas },
                ])
        ),
        input:
            resources.length === 0
                ? input
                : embed(input as SchemaObject, resources, options.isDocument),
    };
};

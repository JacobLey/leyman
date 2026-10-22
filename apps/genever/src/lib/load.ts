import type { HostFilter } from './hosts.js';
import type { SchemaObject } from './read-keyword.js';
import type { DocumentIndex } from './resources.js';
import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GeneverLoadError } from './errors.js';
import { hostFilter } from './hosts.js';
import { isYaml, parseText } from './parse.js';
import { isSchemaObject } from './read-keyword.js';
import {
    declaresDraft04,
    externalResources,
    idKeywordOf,
    indexDocument,
    inputSchemas,
} from './resources.js';

export interface LoadOptions {
    /**
     * URI the input was read from, which relative references resolve against.
     */
    readonly baseUri: string;
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
 * A resource that failed to load, and the `$ref` that needed it.
 */
interface Failure extends Unloadable {
    readonly pointer: string;
    readonly uri: string;
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
 * Load a schema from a file or URL, and index it.
 *
 * Its `$id`, if any, is its base URI. Otherwise the URI it was read from, after redirects, is
 * ([RFC 3986](https://www.rfc-editor.org/rfc/rfc3986#section-5.1.3)), which it is given as its `$id`,
 * so it can be embedded in another document, and still resolve its own references.
 *
 * @param uri - absolute URI, without a fragment
 * @param isAllowed - hosts that may be fetched, or null to load only files
 * @param isInputDraft04 - whether the input is draft-04, which a file without a `$schema` is too
 * @param onRead - called with the text, once read
 * @returns the resource, or why it can't be loaded
 */
const loadResource = async (
    uri: string,
    isAllowed: HostFilter | null,
    isInputDraft04: boolean,
    onRead: LoadOptions['onRead']
): Promise<LoadedResource | Unloadable> => {
    const read = await readText(uri, isAllowed);
    if ('reason' in read) {
        return read;
    }
    onRead?.(uri, read.text);
    let parsed: unknown;
    try {
        parsed = parseText(read.text, read.yaml);
    } catch (error) {
        return {
            cause: error,
            reason: read.yaml ? `not valid YAML: ${(error as Error).message}` : 'not valid JSON',
        };
    }
    if (typeof parsed === 'boolean') {
        parsed = parsed ? {} : { not: {} };
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
            ? { ...parsed, $id: read.uri, $anchor: $id.slice(1) }
            : { ...parsed, $id: $id ?? read.uri };
    const index = indexDocument(schema, inputSchemas(schema, false), read.uri, isDraft04);
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
 * Load every file and URL an input references, and everything they reference in turn,
 * and embed them in the input, so it is one self-contained document.
 *
 * Loaded schemas are embedded with an absolute `$id`, in `$defs` (or an OpenAPI document's
 * `components.schemas`), named after their `title`, or else their file name. References are left as
 * they are, and resolve to the embedded schemas by URI, as in the bundling process of JSON Schema 2020-12.
 *
 * @param input - JSON Schema, or OpenAPI document
 * @param options - how to read the input, and what to load
 * @returns the input with every referenced schema embedded, or the input itself if it references none
 * @throws {GeneverLoadError} if a referenced file or URL can't be loaded
 * @throws {TypeError} if an allowed host is not a host
 */
export const loadReferences = async (input: unknown, options: LoadOptions): Promise<unknown> => {
    const isAllowed = hostFilter(options.fetch);
    const isInputDraft04 =
        !options.isDocument && isSchemaObject(input) && declaresDraft04(input) === true;
    const inputIndex = indexDocument(
        input,
        inputSchemas(input, options.isDocument),
        options.baseUri
    );
    const known = new Set(inputIndex.resources.keys());
    const resources: SchemaObject[] = [];
    const failures: Failure[] = [];
    /**
     * References still to load, as a stack: the last is next. Each is pushed in reverse,
     * so references load in the order they appear, each followed by what it refers to.
     */
    const pending: { index: DocumentIndex; uri: string }[] = [];
    const queueReferences = (index: DocumentIndex): void => {
        const uris = externalResources(index).toReversed();
        pending.push(...uris.map(uri => ({ index, uri })));
    };

    const load = async (uri: string, index: DocumentIndex): Promise<void> => {
        const loaded = await loadResource(uri, isAllowed, isInputDraft04, options.onRead);
        if ('reason' in loaded) {
            failures.push({ ...loaded, pointer: index.references.get(uri)!, uri });
            return;
        }
        resources.push(...loaded.schemas);
        for (const resource of loaded.index.resources.keys()) {
            known.add(resource);
        }
        // Referred to by its URL, even if its `$id` is another
        known.add(uri);
        queueReferences(loaded.index);
    };

    queueReferences(inputIndex);
    while (pending.length > 0) {
        const { index, uri } = pending.pop()!;
        if (!known.has(uri)) {
            await load(uri, index);
        }
    }

    // A resource may fail to load from its URI, but be declared by `$id` in another loaded schema
    const failure = failures.find(({ uri }) => !known.has(uri));
    if (failure) {
        throw new GeneverLoadError(`Could not load "${failure.uri}": ${failure.reason}`, {
            ...('cause' in failure && { cause: failure.cause }),
            pointer: failure.pointer,
        });
    }
    return resources.length === 0
        ? input
        : embed(input as SchemaObject, resources, options.isDocument);
};

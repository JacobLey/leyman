import type { Dialect } from './keywords.js';
import type { SchemaObject } from './read-keyword.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import Path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DecantLoadError } from './errors.js';
import { isSchemaObject } from './read-keyword.js';
import { externalResources, indexDocument, inputSchemas } from './resources.js';

/**
 * Meta-schema of each dialect, for referenced files without a `$schema` of their own.
 */
const dialectIds: Readonly<Record<Dialect, string>> = {
    'draft-2020-12': 'https://json-schema.org/draft/2020-12/schema',
    // Hyperjump can't bundle the OpenAPI 3.0 dialect. Bundling only follows `$ref`s, and keeps
    // other keywords as they are, so 2020-12 bundles it, and decant reads it as OpenAPI 3.0 after.
    'openapi-3.0': 'https://json-schema.org/draft/2020-12/schema',
    'openapi-3.1': 'https://spec.openapis.org/oas/3.1/dialect/base',
};

type Bundle = (uri: string) => Promise<SchemaObject>;

export interface BundleOptions {
    /**
     * URI the input was read from, which relative references resolve against.
     */
    readonly baseUri: string;
    /**
     * Dialect of referenced files without a `$schema`.
     */
    readonly dialect: Dialect;
    /**
     * Whether the input is an OpenAPI document.
     */
    readonly isDocument: boolean;
}

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
 * Bundles referenced files and URLs with Hyperjump.
 *
 * Hyperjump's media type plugins are global, so the dialect of referenced files can't be passed
 * to each bundle. Instead, bundles run one at a time, and the plugin reads the dialect of the current one.
 */
class Bundler {
    #dialectId = dialectIds['draft-2020-12'];
    #loaded: Promise<Bundle> | null = null;
    #queue: Promise<void> = Promise.resolve();

    /**
     * Bundle the references of an input, after any bundle in progress.
     *
     * @param input - JSON Schema, or OpenAPI document
     * @param options - how to read the input
     * @returns the input with every referenced schema embedded, or the input itself if it references none
     * @throws {DecantLoadError} if a referenced file or URL can't be loaded
     */
    public async bundle(input: unknown, options: BundleOptions): Promise<unknown> {
        const previous = this.#queue;
        const { promise, resolve } = Promise.withResolvers<void>();
        this.#queue = promise;
        try {
            await previous;
            return await this.#bundleNow(input, options);
        } finally {
            resolve();
        }
    }

    /**
     * Load Hyperjump, and teach it to read any JSON file or response as a schema
     * (by default, it only reads `.schema.json` files and `application/schema+json` responses).
     *
     * Loaded on first use, so inputs without external references never load it.
     *
     * @returns Hyperjump's `bundle`
     */
    async #load(): Promise<Bundle> {
        const [{ addMediaTypePlugin }, { buildSchemaDocument }, { bundle }] = await Promise.all([
            import('@hyperjump/browser'),
            import('@hyperjump/json-schema/experimental'),
            import('@hyperjump/json-schema/bundle'),
            // Register every dialect a referenced file may declare with `$schema`
            import('@hyperjump/json-schema/draft-04'),
            import('@hyperjump/json-schema/draft-06'),
            import('@hyperjump/json-schema/draft-07'),
            import('@hyperjump/json-schema/draft-2019-09'),
            import('@hyperjump/json-schema/draft-2020-12'),
            import('@hyperjump/json-schema/openapi-3-1'),
        ]);
        const plugin = {
            parse: async (response: Response): Promise<ReturnType<typeof buildSchemaDocument>> =>
                buildSchemaDocument(
                    (await response.json()) as boolean,
                    response.url,
                    this.#dialectId
                ),
            fileMatcher: async (path: string) => path.endsWith('.json'),
        };
        addMediaTypePlugin('application/schema+json', plugin);
        // Servers often send schemas as plain JSON
        addMediaTypePlugin('application/json', plugin);
        return bundle;
    }

    async #bundleNow(input: unknown, options: BundleOptions): Promise<unknown> {
        const index = indexDocument(
            input,
            inputSchemas(input, options.isDocument),
            options.baseUri
        );
        const external = externalResources(index);
        if (external.length === 0) {
            return input;
        }

        this.#loaded ??= this.#load();
        const bundle = await this.#loaded;
        // Hyperjump only reads files from a file, so the schema referencing every resource is one
        const directory = await mkdtemp(Path.join(tmpdir(), 'decant-'));
        try {
            const file = Path.join(directory, 'bundle.json');
            const fileUri = pathToFileURL(file).href;
            this.#dialectId = dialectIds[options.dialect];
            const references = external.map((uri, i) => [i, { $ref: uri }] as const);
            const schema = { $schema: this.#dialectId, $defs: Object.fromEntries(references) };
            await writeFile(file, JSON.stringify(schema));
            let bundled: SchemaObject;
            try {
                bundled = await bundle(fileUri);
            } catch (error) {
                throw new DecantLoadError(`Could not load a referenced schema: ${String(error)}`, {
                    pointer: '#',
                    cause: error,
                });
            }
            const resources = Object.values(bundled.$defs as SchemaObject)
                .filter(
                    (resource): resource is SchemaObject =>
                        isSchemaObject(resource) && typeof resource.$id === 'string'
                )
                .map(resource => {
                    // Bundled `$id`s are relative to the bundle's file
                    const id = new URL(resource.$id as string, fileUri);
                    return { ...resource, $id: id.href };
                })
                // A referenced file may refer back to the input
                .filter(resource => !index.resources.has(resource.$id));
            return embed(input as SchemaObject, resources, options.isDocument);
        } finally {
            await rm(directory, { force: true, recursive: true });
        }
    }
}

const bundler = new Bundler();

/**
 * Bundle every file and URL an input references into the input, so it is one self-contained document.
 *
 * Referenced schemas are embedded with an absolute `$id`, in `$defs` (or an OpenAPI document's
 * `components.schemas`), named after their `title`, or else their file name. References are left as
 * they are, and resolve to the embedded schemas by URI, as in the bundling process of JSON Schema 2020-12.
 *
 * @param input - JSON Schema, or OpenAPI document
 * @param options - how to read the input
 * @returns the input with every referenced schema embedded, or the input itself if it references none
 * @throws {DecantLoadError} if a referenced file or URL can't be loaded
 */
export const bundleReferences = async (input: unknown, options: BundleOptions): Promise<unknown> =>
    bundler.bundle(input, options);

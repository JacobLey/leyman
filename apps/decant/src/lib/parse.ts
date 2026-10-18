import { parseDocument } from 'yaml';
import { DecantInvalidSchemaError, DecantUnsupportedError } from './errors.js';
import { openApiDialect } from './openapi.js';
import { childPointer } from './pointer.js';
import {
    inputSchemas,
    schemaArrayKeywords,
    schemaKeywords,
    schemaMapKeywords,
} from './resources.js';

const yamlExtension = /\.ya?ml$/iu;

/**
 * Whether a file or URL is YAML, rather than JSON.
 *
 * @param uri - absolute URI
 * @param [contentType] - media type a server sent it as
 * @returns true for a `.yaml` or `.yml` path, or a YAML media type
 */
export const isYaml = (uri: string, contentType: string | null = null): boolean => {
    const { pathname } = new URL(uri);
    return yamlExtension.test(pathname) || (contentType !== null && /yaml/iu.test(contentType));
};

/**
 * Where a value is in the document.
 */
interface Location {
    /**
     * Whether the value is a schema, rather than a document, or a keyword's value.
     */
    readonly isSchema: boolean;
    /**
     * JSON Pointer to the value.
     */
    readonly pointer: string;
    /**
     * JSON Pointer to the schema resource the value is in: the nearest schema with an `$id`, or the root.
     */
    readonly resource: string;
}

/**
 * Keywords of a schema whose values are schemas, and whether each is a collection (array or map) of them.
 *
 * @param schema - schema object
 * @returns keywords, and whether each value is a collection
 */
const subschemaKeywords = (schema: Readonly<Record<string, unknown>>): Map<string, boolean> =>
    new Map([
        ...schemaKeywords.map(keyword => [keyword, false] as const),
        // `items` is a schema, or (in draft 7) an array of them
        ...schemaArrayKeywords.map(keyword => [keyword, Array.isArray(schema[keyword])] as const),
        ...schemaMapKeywords.map(keyword => [keyword, true] as const),
    ]);

/**
 * Where a child of a value is: its pointer, in the same resource.
 *
 * @param location - where the value is
 * @param key - key or index of the child
 * @param isSchema - whether the child is a schema
 * @returns where the child is
 */
const childLocation = (location: Location, key: number | string, isSchema: boolean): Location => ({
    isSchema,
    pointer: childPointer(location.pointer, key),
    resource: location.resource,
});

/**
 * A `$ref` to the schema an alias names, in place of the alias inside it.
 *
 * @param target - where the schema is
 * @param location - where the alias is
 * @returns `$ref` schema
 * @throws {DecantInvalidSchemaError} if the alias, or the value it names, is not a schema
 * @throws {DecantUnsupportedError} if there is another resource in between
 */
const aliasReference = (target: Location, location: Location): { $ref: string } => {
    if (!target.isSchema || !location.isSchema) {
        throw new DecantInvalidSchemaError(
            'YAML alias contains itself, but only a schema can be recursive',
            { pointer: location.pointer }
        );
    }
    if (target.resource !== location.resource) {
        throw new DecantUnsupportedError('YAML alias contains itself, with an $id in between', {
            pointer: location.pointer,
        });
    }
    return { $ref: `#${encodeURI(target.pointer.slice(target.resource.length))}` };
};

/**
 * Copies a parsed YAML document as a JSON tree.
 *
 * An alias inside the schema it names (a recursive schema) becomes a `$ref` to that schema.
 * Any other value must have a JSON equivalent.
 */
class JsonTree {
    /**
     * Objects and arrays the value being copied is inside, and where each is.
     */
    readonly #ancestors = new Map<object, Location>();
    readonly #roots: ReadonlySet<string>;

    /**
     * @param roots - JSON Pointers of the document's schemas
     */
    public constructor(roots: readonly string[]) {
        this.#roots = new Set(roots);
    }

    /**
     * Copy a value.
     *
     * @param value - parsed YAML value
     * @param location - where the value is
     * @returns JSON copy of the value
     * @throws {DecantInvalidSchemaError} if the value has no JSON equivalent
     * @throws {DecantUnsupportedError} if a recursive schema contains another resource
     */
    public copy(value: unknown, location: Location): unknown {
        const { pointer } = location;
        if (typeof value === 'number' && !Number.isFinite(value)) {
            throw new DecantInvalidSchemaError(`YAML number ${value} has no JSON equivalent`, {
                pointer,
            });
        }
        if (typeof value !== 'object' || value === null) {
            return value;
        }
        const ancestor = this.#ancestors.get(value);
        if (ancestor) {
            return aliasReference(ancestor, location);
        }
        const located = Array.isArray(value)
            ? location
            : this.#locate(value as Readonly<Record<string, unknown>>, location);
        this.#ancestors.set(value, located);
        const copy = Array.isArray(value)
            ? value.map((item, i) => this.copy(item, childLocation(located, i, false)))
            : this.#copyObject(value as Readonly<Record<string, unknown>>, located);
        this.#ancestors.delete(value);
        return copy;
    }

    /**
     * Where an object is: a schema if it is in a schema location, or is one of the document's schemas,
     * and a resource of its own if it is a schema with an `$id`.
     *
     * @param object - object to locate
     * @param location - where it is in the document
     * @returns location of the object
     */
    #locate(object: Readonly<Record<string, unknown>>, location: Location): Location {
        const isSchema = location.isSchema || this.#roots.has(location.pointer);
        // Draft 7 names a plain anchor with `$id`, which is not a resource
        const isResource =
            isSchema && typeof object.$id === 'string' && !object.$id.startsWith('#');
        return {
            ...location,
            isSchema,
            resource: isResource ? location.pointer : location.resource,
        };
    }

    #copyObject(object: Readonly<Record<string, unknown>>, location: Location): unknown {
        const subschemas = location.isSchema
            ? subschemaKeywords(object)
            : new Map<string, boolean>();
        return Object.fromEntries(
            Object.entries(object).map(([key, child]) => {
                const isCollection = subschemas.get(key);
                const keyLocation = childLocation(location, key, isCollection === false);
                return [
                    key,
                    isCollection
                        ? this.#copyCollection(child, keyLocation)
                        : this.copy(child, keyLocation),
                ];
            })
        );
    }

    /**
     * Copy a keyword's array or map of schemas.
     *
     * @param value - value of the keyword
     * @param location - where the value is
     * @returns JSON copy of the value
     */
    #copyCollection(value: unknown, location: Location): unknown {
        if (typeof value !== 'object' || value === null || this.#ancestors.has(value)) {
            // Not a collection (which the schema is invalid for), or one inside itself
            return this.copy(value, location);
        }
        this.#ancestors.set(value, location);
        const entries = Object.entries(value).map(
            ([key, member]) => [key, this.copy(member, childLocation(location, key, true))] as const
        );
        this.#ancestors.delete(value);
        return Array.isArray(value)
            ? entries.map(([, member]) => member)
            : Object.fromEntries(entries);
    }
}

/**
 * Parse a YAML 1.2 document, with only the values JSON has.
 *
 * Aliases are expanded, and merge keys (`<<`) merged. An alias inside the schema it names, a recursive
 * schema, becomes a `$ref` to that schema. Tags other than the core schema's (e.g. `!!binary`), keys that
 * aren't strings, and duplicate keys are errors.
 *
 * @param text - YAML source
 * @returns parsed document
 * @throws {YAMLError} if the text isn't YAML, or uses a feature JSON doesn't have
 * @throws {DecantInvalidSchemaError} if a value has no JSON equivalent
 * @throws {DecantUnsupportedError} if a recursive schema contains another resource
 * @throws {DecantUnsupportedError} if the document is an unsupported OpenAPI version
 */
export const parseYaml = (text: string): unknown => {
    const document = parseDocument(text, {
        merge: true,
        resolveKnownTags: false,
        schema: 'core',
        stringKeys: true,
    });
    const [problem] = [...document.errors, ...document.warnings];
    if (problem) {
        throw problem;
    }
    const parsed: unknown = document.toJS();
    const roots = inputSchemas(parsed, openApiDialect(parsed) !== null).map(
        ({ pointer }) => pointer
    );
    const tree = new JsonTree(roots);
    return tree.copy(parsed, { isSchema: false, pointer: '#', resource: '#' });
};

/**
 * Parse a JSON or YAML document.
 *
 * @param text - document source
 * @param isYamlText - whether the text is YAML
 * @returns parsed document
 * @throws {SyntaxError | YAMLError} if the text can't be parsed
 * @throws {DecantInvalidSchemaError} if a YAML value has no JSON equivalent
 */
export const parseText = (text: string, isYamlText: boolean): unknown =>
    isYamlText ? parseYaml(text) : JSON.parse(text);

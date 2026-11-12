/**
 * @import { XeneverUnsupportedError } from '#internal/lib/errors.js'
 */
import type { XmlElementNode } from '#internal/lib/xml/nodes.js';
import type { SymbolTables, XsdSchemaSet } from './build.js';
import type { Located, SchemaDocument } from './located.js';
import { readFile as readFileText } from 'node:fs/promises';
import Path from 'node:path';
import {
    reasonOf,
    XeneverInvalidSchemaError,
    XeneverLoadError,
    XeneverXmlError,
} from '#internal/lib/errors.js';
import { xmlNamespace } from '#internal/lib/xml/nodes.js';
import { readXml } from '#internal/lib/xml/read-xml.js';
import { SchemaBuilder } from './build.js';
import {
    checkDerivationSet,
    clark,
    collapsed,
    invalid,
    many,
    readConstruct,
    readKeyword,
    readNcName,
    required,
    unsupported,
    xsdNamespace,
} from './located.js';

/**
 * How `loadXsd` reads files and builds the schema.
 */
export interface LoadXsdOptions {
    /**
     * Reads a file as text. Defaults to reading it from the file system as UTF-8.
     *
     * @param path - absolute path of the file
     * @returns its text
     */
    readonly readFile?: (path: string) => Promise<string>;
    /**
     * Called with each file read, once, in the order they are read: e.g. to record hashes of the inputs.
     *
     * @param path - absolute path of the file
     * @param text - its text
     */
    readonly onRead?: (path: string, text: string) => void;
    /**
     * Local paths of schemas, by the `schemaLocation` of an include or import as written, or by the namespace
     * of an import. A remote `schemaLocation` (a URL) must have an entry: nothing is ever fetched. Relative
     * paths resolve against the current directory, as the path of the XSD does.
     */
    readonly catalog?: Readonly<Record<string, string>>;
    /**
     * Whether big integer types (`xs:integer`, `xs:long`...) are `bigint` rather than `number`.
     */
    readonly bigint?: boolean;
    /**
     * Complex types whose children are ordered (`ordered: true` in the IR), by name in Clark notation:
     * `{namespace}local`, or `local` in no namespace. A name may also be a global element whose type is
     * anonymous; a type of that name takes precedence.
     */
    readonly ordered?: readonly string[];
}

/**
 * A `schemaLocation` with a URL scheme: two characters at least, so a Windows drive (`C:`) is a path.
 */
const remoteLocation = /^[A-Za-z][\d+\-.A-Za-z]+:/v;

/**
 * Child elements of `xs:schema` that are global components, by the symbol table they go in.
 */
const componentTables: Readonly<Record<string, keyof SymbolTables>> = {
    element: 'elements',
    attribute: 'attributes',
    simpleType: 'types',
    complexType: 'types',
    group: 'groups',
    attributeGroup: 'attributeGroups',
};

/**
 * How a file was referred to: by an include or import, which namespace it must target.
 */
interface Reference {
    readonly at: Located;
    readonly kind: 'import' | 'include';
    readonly namespace: string | null;
}

/**
 * How errors say a file was referred to.
 */
const pastTense = { import: 'imported', include: 'included' } as const;

/**
 * Where an include or import is, for an error about the file it refers to.
 *
 * @param at - the include or import
 * @returns e.g. `/xs:schema/xs:include in /schemas/a.xsd, line 3`
 */
const describeReference = (at: Located): string =>
    `${at.node.path} in ${at.doc.filePath}, line ${at.node.location.line}`;

/**
 * Names a target namespace, for errors.
 *
 * @param namespace - namespace name, `null` for none
 * @returns e.g. `` `urn:a` `` or `no namespace`
 */
const describeNamespace = (namespace: string | null): string =>
    namespace === null ? 'no namespace' : `\`${namespace}\``;

/**
 * Parses a file as an XSD: its `xs:schema` element and attributes.
 *
 * @param filePath - absolute path
 * @param text - its text
 * @returns the file, and its includes and imports
 * @throws {XeneverInvalidSchemaError} when it isn't well-formed XML or an XSD
 */
const readDocument = (
    filePath: string,
    text: string
): { readonly doc: SchemaDocument; readonly directives: readonly Located[] } => {
    let root: XmlElementNode;
    try {
        root = readXml(text);
    } catch (error) {
        // Unreachable: reading XML throws only XML errors.
        /* c8 ignore next 3 */
        if (!(error instanceof XeneverXmlError)) {
            throw error;
        }
        throw new XeneverInvalidSchemaError(
            `The schema is not well-formed XML: ${reasonOf(error)}`,
            {
                filePath,
                line: error.line,
                column: error.column,
                path: error.path,
                cause: error,
            }
        );
    }
    const components: Located[] = [];
    const doc: SchemaDocument = {
        filePath,
        root,
        components,
        targetNamespace: null,
        qualifiedElements: false,
        qualifiedAttributes: false,
        references: new Set(),
    };
    const at = { doc, node: root };
    if (root.namespace !== xsdNamespace || root.localName !== 'schema') {
        invalid(at, 'The root element of an XSD is `xs:schema`');
    }
    const construct = readConstruct(at, {
        attributes: [
            'targetNamespace',
            'elementFormDefault',
            'attributeFormDefault',
            'blockDefault',
            'finalDefault',
            'version',
            'id',
        ],
        content: [
            many('include', 'import', 'annotation'),
            many(...Object.keys(componentTables), 'annotation'),
        ],
    });
    const targetAttribute = construct.attributes.get('targetNamespace');
    const targetNamespace = targetAttribute ? collapsed(targetAttribute) : null;
    if (targetNamespace === '') {
        invalid(
            at,
            'A target namespace must not be empty; leave it out for no namespace',
            targetAttribute
        );
    }
    const isQualified = (name: string): boolean =>
        readKeyword(at, construct.attributes.get(name), ['qualified', 'unqualified']) ===
        'qualified';
    checkDerivationSet(at, construct.attributes.get('blockDefault'), [
        'extension',
        'restriction',
        'substitution',
    ]);
    checkDerivationSet(at, construct.attributes.get('finalDefault'), [
        'extension',
        'restriction',
        'list',
        'union',
    ]);
    Object.assign(doc, {
        targetNamespace,
        qualifiedElements: isQualified('elementFormDefault'),
        qualifiedAttributes: isQualified('attributeFormDefault'),
    });
    doc.references.add(targetNamespace);
    const directives = construct.children.filter(
        child => child.node.localName === 'include' || child.node.localName === 'import'
    );
    components.push(...construct.children.slice(directives.length));
    return { doc, directives };
};

/**
 * Checks a file targets the namespace its include or import says
 * ([XSD 1.1 Part 1 §4.2.3](https://www.w3.org/TR/xmlschema11-1/#src-include),
 * [§4.2.6.2](https://www.w3.org/TR/xmlschema11-1/#src-import)).
 *
 * @param doc - the file
 * @param reference - what refers to it
 * @throws {XeneverInvalidSchemaError} when it targets another
 * @throws {XeneverUnsupportedError} for a chameleon include
 */
const checkNamespace = (doc: SchemaDocument, reference: Reference | null): void => {
    if (!reference || doc.targetNamespace === reference.namespace) {
        return;
    }
    if (reference.kind === 'include' && doc.targetNamespace === null) {
        unsupported(
            reference.at,
            'Including a schema without a target namespace into one with a target namespace (a chameleon include) is not supported'
        );
    }
    invalid(
        reference.at,
        `The ${pastTense[reference.kind]} schema targets ${describeNamespace(doc.targetNamespace)}, not ${describeNamespace(reference.namespace)}`
    );
};

/**
 * Reads an XSD and every file it includes and imports, depth first in the order they appear, each once.
 */
class Loader {
    public readonly docs: SchemaDocument[] = [];
    public readonly tables: SymbolTables = {
        elements: new Map(),
        attributes: new Map(),
        types: new Map(),
        groups: new Map(),
        attributeGroups: new Map(),
    };
    readonly #options: LoadXsdOptions;
    readonly #byPath = new Map<string, SchemaDocument>();

    /**
     * @param options - how to read files
     */
    public constructor(options: LoadXsdOptions) {
        this.#options = options;
    }

    /**
     * Reads a file and those it refers to, unless it was read already: includes and imports may be circular.
     *
     * @param filePath - absolute path
     * @param reference - the include or import that refers to it, or `null` for the first file
     * @rejects {XeneverLoadError} when a file can't be read
     * @rejects {XeneverInvalidSchemaError} when a file isn't a valid XSD
     * @rejects {XeneverUnsupportedError} when a file uses a construct outside the supported subset
     */
    public async load(filePath: string, reference: Reference | null): Promise<void> {
        const loaded = this.#byPath.get(filePath);
        if (loaded) {
            checkNamespace(loaded, reference);
            return;
        }
        const text = await this.#read(filePath, reference);
        this.#options.onRead?.(filePath, text);
        const { doc, directives } = readDocument(filePath, text);
        checkNamespace(doc, reference);
        this.#byPath.set(filePath, doc);
        this.docs.push(doc);
        this.#register(doc);
        for (const directive of directives) {
            // One at a time, so files are read, and their components ordered, the same way every time.
            await this.#follow(directive);
        }
    }

    /**
     * Reads a file's text.
     *
     * @param filePath - absolute path
     * @param reference - what refers to it
     * @returns its text
     * @rejects {XeneverLoadError} when it can't be read
     */
    async #read(filePath: string, reference: Reference | null): Promise<string> {
        const { readFile = async (path: string) => readFileText(path, 'utf8') } = this.#options;
        try {
            return await readFile(filePath);
        } catch (error) {
            const from = reference
                ? `, ${pastTense[reference.kind]} at ${describeReference(reference.at)}`
                : '';
            throw new XeneverLoadError(`Could not read the schema${from}`, {
                filePath,
                cause: error,
            });
        }
    }

    /**
     * Adds a file's global components to the symbol tables.
     *
     * @param doc - the file
     * @throws {XeneverInvalidSchemaError} when a component has no name, or one already taken in its table
     */
    #register(doc: SchemaDocument): void {
        for (const at of doc.components) {
            const nameAttribute = at.node.attributes.find(
                attribute => attribute.namespace === null && attribute.localName === 'name'
            );
            if (!nameAttribute) {
                invalid(at, 'A global component has a `name`');
            }
            const name = clark(doc.targetNamespace, readNcName(at, nameAttribute!));
            const table = this.tables[componentTables[at.node.localName]!];
            const existing = table.get(name);
            if (existing) {
                invalid(
                    at,
                    `${name} is already defined (at ${existing.node.path} in ${existing.doc.filePath}, line ${existing.node.location.line})`,
                    nameAttribute
                );
            }
            table.set(name, at);
        }
    }

    /**
     * Looks up the catalog.
     *
     * @param keys - a `schemaLocation` or namespace, each `undefined` or `null` when absent
     * @returns the absolute path of the first key with an entry, or `null` when none has one
     */
    #fromCatalog(...keys: readonly (string | null | undefined)[]): string | null {
        const { catalog = {} } = this.#options;
        const key = keys.find(
            (candidate): candidate is string =>
                typeof candidate === 'string' && Object.hasOwn(catalog, candidate)
        );
        return key === undefined ? null : Path.resolve(catalog[key]!);
    }

    /**
     * Resolves where an include or import points to: its catalog entry, or a local path relative to the file.
     *
     * @param at - the include or import
     * @param location - its `schemaLocation`, if any
     * @param namespace - for an import, its namespace, which may have a catalog entry
     * @returns the absolute path, or `null` for an import without a location or catalog entry
     * @throws {XeneverLoadError} when the location is a URL without a catalog entry
     */
    #locate(at: Located, location: string | undefined, namespace?: string | null): string | null {
        const mapped = this.#fromCatalog(location, namespace);
        if (mapped !== null || location === undefined) {
            return mapped;
        }
        if (remoteLocation.test(location)) {
            throw new XeneverLoadError(
                `The schema at ${describeReference(at)} is not a local file; map its location to one with the \`catalog\` option`,
                { filePath: location }
            );
        }
        return Path.resolve(Path.dirname(at.doc.filePath), location);
    }

    /**
     * Reads the file an include or import refers to.
     *
     * @param at - the `xs:include` or `xs:import` element
     */
    async #follow(at: Located): Promise<void> {
        const { doc, node } = at;
        if (node.localName === 'include') {
            const construct = readConstruct(at, {
                attributes: ['schemaLocation', 'id'],
                content: [],
            });
            const location = collapsed(required(at, construct, 'schemaLocation'));
            await this.load(this.#locate(at, location)!, {
                at,
                kind: 'include',
                namespace: doc.targetNamespace,
            });
            return;
        }
        const construct = readConstruct(at, {
            attributes: ['namespace', 'schemaLocation', 'id'],
            content: [],
        });
        const namespaceAttribute = construct.attributes.get('namespace');
        const namespace = namespaceAttribute ? collapsed(namespaceAttribute) : null;
        if (namespace === '') {
            invalid(
                at,
                'An imported namespace must not be empty; leave it out for no namespace',
                namespaceAttribute
            );
        }
        if (namespace === doc.targetNamespace) {
            invalid(
                at,
                `A schema can not import its own target namespace, ${describeNamespace(namespace)}`
            );
        }
        doc.references.add(namespace);
        if (namespace === xsdNamespace) {
            // Its types are built in.
            return;
        }
        const locationAttribute = construct.attributes.get('schemaLocation');
        const location = locationAttribute && collapsed(locationAttribute);
        // The XML namespace's attributes are built in, so its import needs no file unless the catalog has one.
        const path =
            namespace === xmlNamespace
                ? this.#fromCatalog(location, namespace)
                : this.#locate(at, location, namespace);
        if (path !== null) {
            await this.load(path, { at, namespace, kind: 'import' });
        }
    }
}

/**
 * Reads the `ordered` option.
 *
 * @param names - complex types and global elements, in Clark notation
 * @param tables - global components of the schemas
 * @returns the `xs:complexType` elements they name, with each name
 * @throws {TypeError} when a name is neither a complex type nor a global element with an anonymous one
 */
const orderedTypes = (
    names: readonly string[],
    tables: SymbolTables
): ReadonlyMap<XmlElementNode, string> => {
    const ordered = new Map<XmlElementNode, string>();
    for (const name of names) {
        const component = tables.types.get(name) ?? tables.elements.get(name);
        const described = JSON.stringify(name);
        if (!component) {
            throw new TypeError(
                `\`ordered\` names ${described}, which is neither a type nor a global element`
            );
        }
        let typeNode: XmlElementNode | undefined = component.node;
        if (component.node.localName === 'element') {
            typeNode = component.node.children.find(
                (child): child is XmlElementNode =>
                    child.kind === 'element' &&
                    child.namespace === xsdNamespace &&
                    child.localName === 'complexType'
            );
            if (!typeNode) {
                throw new TypeError(
                    `\`ordered\` names the element ${described}, whose type is not an anonymous complex type; name its type instead`
                );
            }
        } else if (component.node.localName === 'simpleType') {
            throw new TypeError(`\`ordered\` names ${described}, a simple type`);
        }
        ordered.set(typeNode, described);
    }
    return ordered;
};

/**
 * Loads an XSD, with every file it includes and imports, as the schema IR: each global element is ready for
 * `parse`, and each named type is one object wherever it is used. Files are read from local paths only,
 * through `options.readFile`; constructs outside the supported subset throw, never load as a looser schema.
 *
 * @param path - path of the XSD, relative to the current directory
 * @param options - how to read files and build the schema
 * @returns the global elements and named types, in document order
 * @rejects {XeneverLoadError} when a file can't be read, or a `schemaLocation` is a URL without a catalog
 * entry
 * @rejects {XeneverInvalidSchemaError} when a file isn't a valid XSD
 * @rejects {XeneverUnsupportedError} when a file uses a construct outside the supported subset
 * @rejects {TypeError} when `ordered` names something other than a complex type with child elements
 */
export const loadXsd = async (
    path: string,
    options: LoadXsdOptions = {}
): Promise<XsdSchemaSet> => {
    const loader = new Loader(options);
    await loader.load(Path.resolve(path), null);
    const builder = new SchemaBuilder(loader.tables, {
        bigint: options.bigint === true,
        ordered: orderedTypes(options.ordered ?? [], loader.tables),
    });
    return builder.build(loader.docs);
};

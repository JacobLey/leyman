import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { parseXml, XmlElement, XmlNode } from '@rgrove/parse-xml';
import { decodeXml } from './decode.js';

/**
 * Namespace of XML Schema documents.
 */
const xsdNamespace = 'http://www.w3.org/2001/XMLSchema';

/**
 * Namespace of the `xsi` attributes.
 */
const xsiNamespace = 'http://www.w3.org/2001/XMLSchema-instance';

/**
 * Namespace of the XSD 1.1 version control attributes (`vc:minVersion`...).
 */
const versioningNamespace = 'https://www.w3.org/2007/XMLSchema-versioning';

/**
 * The outcome a test expects.
 */
export type Validity = 'invalid' | 'valid';

/**
 * An instance document validated against the schema of its test group.
 */
export interface InstanceCase {
    /**
     * `<schema case id>/<instanceTest name>`.
     */
    readonly id: string;
    /**
     * Path of the document, from the suite's root.
     */
    readonly document: string;
    /**
     * Whether it is valid against the schema.
     */
    readonly expected: Validity;
}

/**
 * A test group: a schema, whether it is valid, and the instances validated against it.
 */
export interface SchemaCase {
    /**
     * `<testSet name>/<testGroup name>`.
     */
    readonly id: string;
    /**
     * Paths of the schema documents, from the suite's root.
     */
    readonly documents: readonly string[];
    /**
     * Whether the schema is valid.
     */
    readonly expected: Validity;
    /**
     * Instances that apply to XSD 1.0, only when the schema is valid.
     */
    readonly instances: readonly InstanceCase[];
}

/**
 * Local part of a name as written, dropping its prefix. Good enough for the suite's own metadata, which uses
 * one namespace throughout.
 *
 * @param name - qualified name
 * @returns its local part
 */
const localName = (name: string): string => name.slice(name.indexOf(':') + 1);

/**
 * Child elements, by local name.
 *
 * @param element - parent
 * @param name - local name of the children
 * @returns the children of that name
 */
const childrenNamed = (element: XmlElement, name: string): XmlElement[] =>
    element.children.filter(
        (child): child is XmlElement =>
            child instanceof XmlElement && localName(child.name) === name
    );

/**
 * Whitespace-separated tokens of a `version` attribute.
 *
 * @param element - element that may have one
 * @returns its tokens, empty when there is none
 */
const versionTokens = (element: XmlElement): string[] =>
    (element.attributes.version ?? '').split(/\s+/v).filter(token => token !== '');

/**
 * Whether a `version` applies to an XSD 1.0 processor: it names no XSD version, or names 1.0. A processor
 * using today's Unicode is not a Unicode 4.0.0 one ([bug 13607](https://www.w3.org/Bugs/Public/show_bug.cgi?id=13607)
 * moved those tests to Unicode 6.0.0, the newest the suite names).
 *
 * @param tokens - the version tokens
 * @returns whether they apply
 */
const isForXsd10 = (tokens: readonly string[]): boolean => {
    if (tokens.includes('Unicode_4.0.0') && !tokens.includes('Unicode_6.0.0')) {
        return false;
    }
    const xsdVersions = tokens.filter(token => /^1\.\d$/v.test(token));
    return xsdVersions.length === 0 || xsdVersions.includes('1.0');
};

/**
 * The validity a test expects of an XSD 1.0 processor, if it is settled: its status is `accepted` or
 * `stable` (not queried or disputed), and exactly one `expected` applies, `valid` or `invalid`.
 *
 * @param test - a `schemaTest` or `instanceTest`
 * @returns the expected validity, or `null` when the test doesn't apply
 */
const expectedOf = (test: XmlElement): Validity | null => {
    const status = childrenNamed(test, 'current')[0]?.attributes.status;
    if (status !== 'accepted' && status !== 'stable') {
        return null;
    }
    if (!isForXsd10(versionTokens(test).filter(token => !token.startsWith('Unicode')))) {
        return null;
    }
    const validities = new Set(
        childrenNamed(test, 'expected')
            .filter(expected => isForXsd10(versionTokens(expected)))
            .map(expected => expected.attributes.validity)
    );
    const [validity] = validities;
    return validities.size === 1 && (validity === 'valid' || validity === 'invalid')
        ? validity
        : null;
};

/**
 * Directories of the test sets written for XSD 1.0. `suite.xml`'s own documentation says the Saxonica, IBM
 * and Oracle sets are XSD 1.1 tests (the W3C working group's too, by their names), and many of them carry no
 * `version`, expecting what a 1.1 processor does.
 */
const xsd10Contributions = ['nistMeta/', 'sunMeta/', 'msMeta/', 'boeingMeta/'];

/**
 * Reads a file of the suite's metadata.
 *
 * @param root - root of the suite
 * @param path - path of the file, from the root
 * @returns its root element
 */
const readMetadata = async (root: string, path: string): Promise<XmlElement> =>
    parseXml(await readFile(Path.join(root, path), 'utf8')).root!;

/**
 * Reads a test group that applies to XSD 1.0, with its instance tests when its schema is valid.
 *
 * @param testSet - the test set holding it
 * @param testSetPath - path of the test set's file, from the suite's root
 * @param group - its `testGroup` element
 * @returns the case, `null` when it has no schema test that applies
 */
const readGroup = (
    testSet: XmlElement,
    testSetPath: string,
    group: XmlElement
): SchemaCase | null => {
    const [schemaTest] = childrenNamed(group, 'schemaTest');
    const expected = schemaTest ? expectedOf(schemaTest) : null;
    if (!schemaTest || !expected || !isForXsd10(versionTokens(group))) {
        return null;
    }
    const resolve = (href: string): string =>
        Path.posix.join(Path.posix.dirname(testSetPath), href);
    const id = `${String(testSet.attributes.name)}/${String(group.attributes.name)}`;
    const instances: InstanceCase[] = [];
    // Instances are only validated against a valid schema.
    const instanceTests = expected === 'valid' ? childrenNamed(group, 'instanceTest') : [];
    for (const instanceTest of instanceTests) {
        const instanceExpected = expectedOf(instanceTest);
        if (!instanceExpected) {
            continue;
        }
        const [document] = childrenNamed(instanceTest, 'instanceDocument');
        instances.push({
            id: `${id}/${String(instanceTest.attributes.name)}`,
            document: resolve(document!.attributes['xlink:href']!),
            expected: instanceExpected,
        });
    }
    return {
        documents: childrenNamed(schemaTest, 'schemaDocument').map(document =>
            resolve(document.attributes['xlink:href']!)
        ),
        id,
        expected,
        instances,
    };
};

/**
 * Reads every test group of the W3C XML Schema test suite that applies to an XSD 1.0 processor and has a
 * schema test.
 *
 * @param root - root of the suite (holding `suite.xml`)
 * @returns the cases, in the suite's order
 */
export const readXsdTests = async (root: string): Promise<SchemaCase[]> => {
    const suite = await readMetadata(root, 'suite.xml');
    const testSetPaths = childrenNamed(suite, 'testSetRef')
        .map(reference => reference.attributes['xlink:href']!)
        .filter(path => xsd10Contributions.some(directory => path.startsWith(directory)));
    const cases: SchemaCase[] = [];
    for (const testSetPath of testSetPaths) {
        const testSet = await readMetadata(root, testSetPath);
        if (!isForXsd10(versionTokens(testSet))) {
            continue;
        }
        for (const group of childrenNamed(testSet, 'testGroup')) {
            const schemaCase = readGroup(testSet, testSetPath, group);
            if (schemaCase) {
                cases.push(schemaCase);
            }
        }
    }
    return cases;
};

/**
 * Why a schema or instance is outside xenever's v1 subset, as found by reading it independently of xenever.
 */
export type OutsideReason =
    | 'abstract'
    | 'chameleon include'
    | 'DTD'
    | 'identity constraint'
    | 'multiple schema documents'
    | 'notation'
    | 'redefine'
    | 'substitution group'
    | 'XSD 1.1'
    | 'xsi:type';

/**
 * What reading a schema's documents found.
 */
export interface SchemaScan {
    /**
     * Constructs outside the v1 subset, empty when it is inside.
     */
    readonly outside: ReadonlySet<OutsideReason>;
    /**
     * Every document read, from the suite's root: the schema documents and what they include, import or
     * redefine.
     */
    readonly files: readonly string[];
}

/**
 * In-scope namespaces of an element: its parent's, plus its own declarations.
 *
 * @param element - the element whose `xmlns` attributes are read
 * @param parent - in-scope namespaces of its parent
 * @returns its in-scope namespaces, by prefix (`''` for the default namespace)
 */
const scopeOf = (
    element: XmlElement,
    parent: ReadonlyMap<string, string>
): ReadonlyMap<string, string> => {
    const declarations = Object.entries(element.attributes).filter(
        ([name]) => name === 'xmlns' || name.startsWith('xmlns:')
    );
    if (declarations.length === 0) {
        return parent;
    }
    const scope = new Map(parent);
    for (const [name, value] of declarations) {
        scope.set(name === 'xmlns' ? '' : name.slice('xmlns:'.length), value);
    }
    return scope;
};

/**
 * Namespace of a prefixed name: of an element (unprefixed takes the default namespace) or of an attribute or
 * QName value.
 *
 * @param name - the name as written
 * @param scope - in-scope namespaces
 * @param isDefaulted - whether an unprefixed name takes the default namespace
 * @returns its namespace, `undefined` for an undeclared prefix
 */
const namespaceOf = (
    name: string,
    scope: ReadonlyMap<string, string>,
    isDefaulted: boolean
): string | undefined => {
    const colon = name.indexOf(':');
    if (colon === -1) {
        return isDefaulted ? scope.get('') : '';
    }
    return scope.get(name.slice(0, colon));
};

/**
 * Elements of XSD 1.1 only.
 */
const xsd11Elements = new Set([
    'alternative',
    'assert',
    'assertion',
    'defaultOpenContent',
    'explicitTimezone',
    'openContent',
    'override',
]);

/**
 * Whether an XML document has a document type declaration.
 *
 * @param text - the document
 * @returns whether it has one
 */
const hasDoctype = (text: string): boolean =>
    parseXml(text, { preserveDocumentType: true }).children.some(
        node => node.type === XmlNode.TYPE_DOCUMENT_TYPE
    );

/**
 * Reads a schema's documents, and every document they include, import or redefine (by a local
 * `schemaLocation`), for constructs outside xenever's v1 subset.
 *
 * @param root - root of the suite
 * @param documents - the schema documents, from the root
 * @returns what it found
 */
export const scanSchema = async (
    root: string,
    documents: readonly string[]
): Promise<SchemaScan> => {
    const outside = new Set<OutsideReason>();
    if (documents.length > 1) {
        outside.add('multiple schema documents');
    }
    const files: string[] = [];
    const visit = async (path: string, includedInto: string | null): Promise<void> => {
        if (files.includes(path)) {
            return;
        }
        files.push(path);
        let text: string;
        try {
            text = decodeXml(await readFile(Path.join(root, path)));
        } catch {
            // Missing or not decodable: the schema is broken in a way xenever reports itself.
            return;
        }
        let schema: XmlElement;
        try {
            if (hasDoctype(text)) {
                outside.add('DTD');
            }
            schema = parseXml(text, { ignoreUndefinedEntities: true }).root!;
        } catch {
            return;
        }
        const targetNamespace = schema.attributes.targetNamespace ?? '';
        if (includedInto !== null && targetNamespace === '' && includedInto !== '') {
            outside.add('chameleon include');
        }
        const pending: Promise<void>[] = [];
        const walk = (
            element: XmlElement,
            parentScope: ReadonlyMap<string, string>,
            isInAll = false
        ): void => {
            const scope = scopeOf(element, parentScope);
            const isXsd = namespaceOf(element.name, scope, true) === xsdNamespace;
            const name = localName(element.name);
            if (isXsd && ['appinfo', 'documentation'].includes(name)) {
                // Anything inside is data for apps, not part of the schema.
                return;
            }
            if (isXsd) {
                const { attributes } = element;
                if (['key', 'keyref', 'unique'].includes(name)) {
                    outside.add('identity constraint');
                } else if (name === 'redefine') {
                    outside.add('redefine');
                } else if (name === 'notation') {
                    outside.add('notation');
                }
                if (
                    xsd11Elements.has(name) ||
                    attributes.notNamespace !== undefined ||
                    attributes.notQName !== undefined ||
                    (name !== 'schema' && attributes.targetNamespace !== undefined) ||
                    (name === 'all' &&
                        element.children.some(
                            child =>
                                child instanceof XmlElement &&
                                ['any', 'group'].includes(localName(child.name))
                        )) ||
                    (isInAll &&
                        attributes.maxOccurs !== undefined &&
                        !['0', '1'].includes(attributes.maxOccurs.trim()))
                ) {
                    outside.add('XSD 1.1');
                }
                if (attributes.substitutionGroup !== undefined) {
                    outside.add('substitution group');
                }
                if (attributes.abstract === 'true' || attributes.abstract === '1') {
                    outside.add('abstract');
                }
                for (const attribute of ['type', 'base', 'itemType']) {
                    const value = attributes[attribute]?.trim();
                    if (
                        value !== undefined &&
                        localName(value) === 'NOTATION' &&
                        namespaceOf(value, scope, true) === xsdNamespace
                    ) {
                        outside.add('notation');
                    }
                }
                const members = (attributes.memberTypes ?? '').split(/\s+/v);
                for (const member of members) {
                    if (
                        localName(member) === 'NOTATION' &&
                        namespaceOf(member, scope, true) === xsdNamespace
                    ) {
                        outside.add('notation');
                    }
                }
                const location = attributes.schemaLocation;
                if (
                    location !== undefined &&
                    ['include', 'import', 'redefine'].includes(name) &&
                    !/^[A-Za-z][\d+\-.A-Za-z]+:/v.test(location)
                ) {
                    pending.push(
                        visit(
                            Path.posix.join(Path.posix.dirname(path), location),
                            name === 'import' ? null : targetNamespace
                        )
                    );
                }
            }
            if (
                Object.keys(element.attributes).some(
                    attribute =>
                        attribute.includes(':') &&
                        namespaceOf(attribute, scope, false) === versioningNamespace
                )
            ) {
                outside.add('XSD 1.1');
            }
            for (const child of element.children) {
                if (child instanceof XmlElement) {
                    walk(child, scope, isXsd && name === 'all');
                }
            }
        };
        walk(schema, new Map([['xml', 'http://www.w3.org/XML/1998/namespace']]));
        await Promise.all(pending);
    };
    for (const document of documents) {
        await visit(document, null);
    }
    return { outside, files };
};

/**
 * What reading an instance document found.
 */
export interface InstanceScan {
    /**
     * Constructs outside the v1 subset, empty when it is inside.
     */
    readonly outside: ReadonlySet<OutsideReason>;
    /**
     * Its root element, `null` when it isn't well-formed.
     */
    readonly root: { readonly namespace: string | null; readonly localName: string } | null;
}

/**
 * Reads an instance document for its root element and what xenever's v1 subset leaves out: `xsi:type`
 * (polymorphism, v2) and a DTD (always rejected).
 *
 * @param text - the document
 * @returns what it found
 */
export const scanInstance = (text: string): InstanceScan => {
    const outside = new Set<OutsideReason>();
    let document: XmlElement;
    try {
        if (hasDoctype(text)) {
            outside.add('DTD');
        }
        document = parseXml(text, { ignoreUndefinedEntities: true }).root!;
    } catch {
        return { outside, root: null };
    }
    const walk = (element: XmlElement, parentScope: ReadonlyMap<string, string>): void => {
        const scope = scopeOf(element, parentScope);
        for (const attribute of Object.keys(element.attributes)) {
            if (
                localName(attribute) === 'type' &&
                namespaceOf(attribute, scope, false) === xsiNamespace
            ) {
                outside.add('xsi:type');
            }
        }
        for (const child of element.children) {
            if (child instanceof XmlElement) {
                walk(child, scope);
            }
        }
    };
    walk(document, new Map());
    const namespace = namespaceOf(document.name, scopeOf(document, new Map()), true);
    return {
        outside,
        root: {
            namespace: namespace === undefined || namespace === '' ? null : namespace,
            localName: localName(document.name),
        },
    };
};

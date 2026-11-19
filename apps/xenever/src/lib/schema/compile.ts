import type { XeneverInvalidSchemaError } from '#internal/lib/errors.js';
import type { CompiledSimple } from '#internal/lib/simple/compile-simple.js';
import type { AllPart, ModelSymbol, Pattern } from './content.js';
import type { CompiledIdentity } from './identity.js';
import type { ProcessContents } from './ir.js';
import { XeneverUnsupportedError } from '#internal/lib/errors.js';
import { InvalidValueError } from '#internal/lib/simple/builtins.js';
import { compileSimple } from '#internal/lib/simple/compile-simple.js';
import { ncNamePattern } from '#internal/lib/simple/names.js';
import {
    checkArray,
    checkInteger,
    checkObject,
    checkString,
    childPath,
    invalidSchema,
    isFlagged,
    shapeConflict,
} from './check.js';
import { ContentModel } from './content.js';
import { compileIdentities } from './identity.js';

/**
 * Identifies a name by namespace name and local name: prefixes are cosmetic.
 *
 * @param namespace - namespace name, `null` for none
 * @param localName - name without its prefix
 * @returns a key that is equal for equal names
 */
export const expandedName = (namespace: string | null, localName: string): string =>
    JSON.stringify([namespace, localName]);

/**
 * How errors name an element or attribute.
 *
 * @param namespace - namespace name, `null` for none
 * @param localName - name without its prefix
 * @returns e.g. `` `item` `` or `` `item` in `urn:example` ``
 */
export const describeName = (namespace: string | null, localName: string): string =>
    namespace === null ? `\`${localName}\`` : `\`${localName}\` in \`${namespace}\``;

/**
 * A value constraint's value: as written, and as read.
 */
export interface FixedValue {
    readonly lexical: string;
    readonly value: unknown;
}

/**
 * An attribute declaration, ready to read attributes.
 */
export interface CompiledAttribute {
    readonly name: string;
    readonly namespace: string | null;
    readonly key: string;
    readonly type: CompiledSimple;
    readonly required: boolean;
    /**
     * Text read when the attribute is absent: its `default` or `fixed`.
     */
    readonly absent: string | null;
    readonly fixed: FixedValue | null;
}

/**
 * A wildcard, ready to match names.
 *
 * @template Declaration - a compiled declaration it validates against
 */
export interface CompiledWildcard<Declaration> {
    /**
     * Whether the wildcard allows a name in this namespace.
     */
    readonly allows: (namespace: string | null) => boolean;
    /**
     * How errors name what it allows, e.g. `any element`.
     */
    readonly label: string;
    readonly processContents: ProcessContents;
    /**
     * Its declarations by expanded name.
     */
    readonly declarations: ReadonlyMap<string, Declaration>;
}

/**
 * A complex type's child elements: the model they must match, the declaration of each element by expanded
 * name, and each key of `children` in declaration order with whether its value is an array.
 */
export interface CompiledContent {
    readonly model: ContentModel;
    readonly elements: ReadonlyMap<string, CompiledElement>;
    /**
     * Each wildcard of the model, by the id of its symbol.
     */
    readonly wildcards: ReadonlyMap<string, CompiledWildcard<CompiledElement>>;
    readonly keys: readonly { readonly key: string; readonly array: boolean }[];
}

/**
 * A complex type, ready to read elements.
 */
export interface CompiledComplex {
    readonly kind: 'complex';
    /**
     * Its name, `null` for a type without one, which `xsi:type` can't name.
     */
    readonly name: string | null;
    readonly namespace: string | null;
    /**
     * The `type` of a value read as it, `null` without a name.
     */
    readonly key: string | null;
    readonly abstract: boolean;
    /**
     * Attribute declarations by expanded name, in declaration order.
     */
    readonly attributes: ReadonlyMap<string, CompiledAttribute>;
    readonly anyAttribute: CompiledWildcard<CompiledAttribute> | null;
    readonly content: CompiledContent | null;
    readonly text: CompiledSimple | null;
    readonly mixed: boolean;
    /**
     * Whether `children` is ordered: set, or mixed.
     */
    readonly ordered: boolean;
}

/**
 * The type of an element.
 */
export type CompiledType =
    | CompiledComplex
    | { readonly kind: 'simple'; readonly simple: CompiledSimple };

/**
 * An element declaration, ready to read elements. Its type is set once compiled, after the declaration is
 * cached, so a recursive reference finds it.
 */
export interface CompiledElement {
    readonly name: string;
    readonly namespace: string | null;
    readonly key: string;
    readonly type: CompiledType;
    readonly nillable: boolean;
    /**
     * Text read when the element is empty: its `default` or `fixed`.
     */
    readonly empty: string | null;
    readonly fixed: FixedValue | null;
    /**
     * Its identity constraints, `null` when it has none, so reading an element costs nothing for them.
     */
    readonly identity: readonly CompiledIdentity[] | null;
    /**
     * Whether it can never occur in a document.
     */
    readonly abstract: boolean;
    /**
     * The types `xsi:type` may select besides the declared one, by expanded name; `null` without `types`, when
     * its value has no `type`.
     */
    readonly types: ReadonlyMap<string, CompiledComplex> | null;
    /**
     * Its `fixed` value as each of `types` reads it, compared in that type's value space
     * ([XSD 1.0 Part 1 §3.3.4](https://www.w3.org/TR/xmlschema-1/#cvc-elt), clause 5.2.2). A type the value
     * isn't valid for has no entry, and no value it reads matches. `null` without `fixed` or `types`.
     */
    readonly typesFixed: ReadonlyMap<CompiledComplex, FixedValue> | null;
}

/**
 * Element properties a declaration may have.
 */
const elementProperties = [
    'kind',
    'name',
    'type',
    'namespace',
    'minOccurs',
    'maxOccurs',
    'key',
    'nillable',
    'default',
    'fixed',
    'identity',
    'abstract',
    'types',
];

/**
 * Namespaces in scope for a value written in the schema: none, so a `QName` value is unsupported there.
 */
const noNamespaces: ReadonlyMap<string, string> = new Map();

/**
 * Checks a declaration's `default` and `fixed`, which must be valid for its type.
 *
 * @param record - the declaration
 * @param type - its simple type, or the simple type of its text
 * @param path - path to the declaration
 * @returns the text read when absent or empty, and the fixed value
 * @throws {XeneverInvalidSchemaError} when both are given, one isn't valid for the type, or the type is an
 * `ID`
 * @throws {XeneverUnsupportedError} when the type may be a `QName`, which a value written in the schema can't
 * resolve
 */
const compileValueConstraint = (
    record: Readonly<Record<string, unknown>>,
    type: CompiledSimple | null,
    path: string
): { readonly fallback: string | null; readonly fixed: FixedValue | null } => {
    const defaultValue = checkString(record.default, childPath(path, 'default'));
    const fixedValue = checkString(record.fixed, childPath(path, 'fixed'));
    const lexical = defaultValue ?? fixedValue;
    if (lexical === undefined) {
        return { fallback: null, fixed: null };
    }
    const property = defaultValue === undefined ? 'fixed' : 'default';
    const constraintPath = childPath(path, property);
    if (defaultValue !== undefined && fixedValue !== undefined) {
        invalidSchema('A declaration has either `default` or `fixed`, not both', path);
    }
    if (type === null) {
        return invalidSchema(
            `\`${property}\` needs a simple type or a complex type with \`text\``,
            constraintPath
        );
    }
    if (type.isId) {
        // Every element or attribute it fills in would hold the same ID
        // ([XSD 1.0 Part 1 §3.2.6](https://www.w3.org/TR/xmlschema-1/#a-props-correct), clause 3, and
        // [§3.3.6](https://www.w3.org/TR/xmlschema-1/#e-props-correct), clause 5).
        invalidSchema(`An \`ID\` can not have a \`${property}\``, constraintPath);
    }
    if (type.hasQName) {
        throw new XeneverUnsupportedError(
            `\`${property}\` of a type that may be a QName is not supported: the schema has no namespaces to resolve it`,
            { path: constraintPath }
        );
    }
    let value: unknown;
    try {
        value = type.parse(lexical, noNamespaces);
    } catch (error) {
        // Unreachable: reading a value throws only invalid values.
        /* c8 ignore next 3 */
        if (!(error instanceof InvalidValueError)) {
            throw error;
        }
        invalidSchema(
            `\`${property}\` is not valid for the type: ${error.message}`,
            constraintPath
        );
    }
    return { fallback: lexical, fixed: fixedValue === undefined ? null : { lexical, value } };
};

/**
 * Checks a local name.
 *
 * @param value - the `name` property
 * @param path - path to the declaration
 * @returns it, checked
 * @throws {XeneverInvalidSchemaError} when it isn't an NCName
 */
const checkName = (value: unknown, path: string): string => {
    if (typeof value !== 'string' || !ncNamePattern.test(value)) {
        invalidSchema(`Name ${JSON.stringify(value)} is not an NCName`, childPath(path, 'name'));
    }
    return value as string;
};

/**
 * Checks a namespace name.
 *
 * @param value - the `namespace` property
 * @param path - path to the declaration
 * @returns the namespace name, `null` when absent
 * @throws {XeneverInvalidSchemaError} when it is empty: no namespace is written by leaving it out
 */
const checkNamespace = (value: unknown, path: string): string | null => {
    const namespacePath = childPath(path, 'namespace');
    const namespace = checkString(value, namespacePath);
    if (namespace === '') {
        invalidSchema(
            'A namespace name must not be empty; leave it out for no namespace',
            namespacePath
        );
    }
    return namespace ?? null;
};

/**
 * Checks a declaration's key.
 *
 * @param value - the `key` property
 * @param fallback - the local name, the key when none is given
 * @param path - path to the declaration
 * @returns the key to use
 * @throws {XeneverInvalidSchemaError} when it is empty or starts with `#`
 */
const checkKey = (value: unknown, fallback: string, path: string): string => {
    const keyPath = childPath(path, 'key');
    const key = checkString(value, keyPath);
    if (key !== undefined && (key === '' || key.startsWith('#'))) {
        invalidSchema(
            'A key must not be empty or start with `#`, which marks synthetic keys',
            keyPath
        );
    }
    return key ?? fallback;
};

/**
 * Checks a particle's occurrences.
 *
 * @param record - the particle
 * @param path - path to it
 * @returns its bounds, `max` infinite when unbounded
 * @throws {XeneverInvalidSchemaError} when they aren't valid bounds
 */
const checkOccurs = (
    record: Readonly<Record<string, unknown>>,
    path: string
): { readonly min: number; readonly max: number } => {
    const min = checkInteger(record.minOccurs, childPath(path, 'minOccurs')) ?? 1;
    const maxPath = childPath(path, 'maxOccurs');
    const max =
        record.maxOccurs === 'unbounded'
            ? Number.POSITIVE_INFINITY
            : (checkInteger(record.maxOccurs, maxPath, 1) ?? 1);
    if (max < min) {
        invalidSchema('`maxOccurs` is less than `minOccurs`', maxPath);
    }
    return { min, max };
};

/**
 * Compiled element declarations and complex types, by schema value.
 */
const compiledElements = new WeakMap<object, CompiledElement>();
const compiledComplexTypes = new WeakMap<object, CompiledComplex>();

/**
 * Checks and compiles an element declaration, once per declaration object. The first problem found throws a
 * {@link XeneverInvalidSchemaError} or {@link XeneverUnsupportedError} with its path in the declaration.
 *
 * @param declaration - schema value of the declaration
 * @param path - path to it
 * @returns its compiled form
 * @throws {XeneverInvalidSchemaError} when the declaration, or anything in it, is invalid
 * @throws {XeneverUnsupportedError} when it uses something xenever doesn't support
 */
export const compileElement = (declaration: unknown, path: string): CompiledElement => {
    const record = checkObject(declaration, elementProperties, path);
    const cached = compiledElements.get(record);
    if (cached) {
        return cached;
    }
    if (record.kind !== 'element') {
        invalidSchema(`Expected an element declaration, not ${JSON.stringify(record.kind)}`, path);
    }
    const name = checkName(record.name, path);
    checkOccurs(record, path);
    const compiled: { -readonly [K in keyof CompiledElement]: CompiledElement[K] } = {
        name,
        namespace: checkNamespace(record.namespace, path),
        key: checkKey(record.key, name, path),
        nillable: isFlagged(record.nillable, childPath(path, 'nillable')),
        // Set below, once the declaration is cached for recursive references to find.
        type: undefined as unknown as CompiledType,
        empty: null,
        fixed: null,
        identity: compileIdentities(record.identity, childPath(path, 'identity'), describeName),
        abstract: isFlagged(record.abstract, childPath(path, 'abstract')),
        types: null,
        typesFixed: null,
    };
    compiledElements.set(record, compiled);
    // eslint-disable-next-line @typescript-eslint/no-use-before-define -- Types and elements nest each other
    const type = compileType(record.type, childPath(path, 'type'));
    compiled.type = type;
    if (type.kind === 'complex' && type.mixed && (record.default ?? record.fixed) !== undefined) {
        throw new XeneverUnsupportedError(
            '`default` and `fixed` of an element with mixed content are not supported',
            { path: childPath(path, record.default === undefined ? 'fixed' : 'default') }
        );
    }
    const { fallback, fixed } = compileValueConstraint(
        record,
        type.kind === 'simple' ? type.simple : type.text,
        path
    );
    compiled.empty = fallback;
    compiled.fixed = fixed;
    if (record.types !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define -- Types and elements nest each other
        const types = compileTypes(record, type, path);
        compiled.types = types.types;
        compiled.typesFixed = types.fixed;
    }
    return compiled;
};

/**
 * Checks and compiles the type of an element.
 *
 * @param type - schema value of the type
 * @param path - path to it
 * @returns its compiled form
 */
const compileType = (type: unknown, path: string): CompiledType =>
    (type as { readonly kind?: unknown } | null)?.kind === 'complex'
        ? // eslint-disable-next-line @typescript-eslint/no-use-before-define -- Types and elements nest each other
          compileComplex(type as object, path)
        : { kind: 'simple', simple: compileSimple(type, path) };

/**
 * Checks and compiles an attribute declaration.
 *
 * @param declaration - schema value of the declaration
 * @param path - path to it
 * @returns its compiled form
 */
const compileAttribute = (declaration: unknown, path: string): CompiledAttribute => {
    const record = checkObject(
        declaration,
        ['kind', 'name', 'type', 'namespace', 'use', 'key', 'default', 'fixed'],
        path
    );
    if (record.kind !== 'attribute') {
        invalidSchema(
            `Expected an attribute declaration, not ${JSON.stringify(record.kind)}`,
            path
        );
    }
    const name = checkName(record.name, path);
    if (record.use !== undefined && !['optional', 'required'].includes(record.use as string)) {
        invalidSchema('`use` must be `optional` or `required`', childPath(path, 'use'));
    }
    const type = compileSimple(record.type, childPath(path, 'type'));
    const { fallback, fixed } = compileValueConstraint(record, type, path);
    if (record.default !== undefined && record.use === 'required') {
        invalidSchema(
            'An attribute with a `default` is never missing, so it must not be required',
            childPath(path, 'default')
        );
    }
    return {
        name,
        type,
        fixed,
        namespace: checkNamespace(record.namespace, path),
        key: checkKey(record.key, name, path),
        required: record.use === 'required',
        absent: fallback,
    };
};

/**
 * Lists namespaces for an error label.
 *
 * @param namespaces - namespace names, `null` for none
 * @returns e.g. `` `urn:a` or no namespace ``
 */
const listNamespaces = (namespaces: readonly (string | null)[]): string =>
    namespaces
        .map(namespace => (namespace === null ? 'no namespace' : `\`${namespace}\``))
        .join(' or ');

/**
 * What the getter of each lazy reference or wildcard returned.
 */
const getterResults = new WeakMap<object, unknown>();

/**
 * What the getter of a lazy reference or wildcard returns, called once: a cycle ends when compiling reaches a
 * declaration it is already compiling, so a getter that builds a new declaration on each call
 * (`() => x.element(...)`) must still give the same one each time.
 *
 * @param owner - the reference or wildcard
 * @param get - its getter
 * @returns what the getter returned the first time
 */
const getterResult = (owner: object, get: () => unknown): unknown => {
    if (!getterResults.has(owner)) {
        getterResults.set(owner, get());
    }
    return getterResults.get(owner);
};

/**
 * What `processContents` may be.
 */
const processContentsValues: ReadonlySet<unknown> = new Set(['skip', 'lax', 'strict']);

/**
 * Checks and compiles a wildcard: its namespace constraint, `processContents` and declarations.
 *
 * @param record - the wildcard's schema value, already checked to be an object
 * @param noun - `element` or `attribute`, for its error label
 * @param path - path to it
 * @param compile - checks and compiles one of its declarations
 * @returns the compiled wildcard
 * @throws {XeneverInvalidSchemaError} when the wildcard is invalid, or two of its declarations have one name
 */
const compileWildcard = <
    Declaration extends { readonly name: string; readonly namespace: string | null },
>(
    record: Readonly<Record<string, unknown>>,
    noun: 'attribute' | 'element',
    path: string,
    compile: (declaration: unknown, path: string) => Declaration
): CompiledWildcard<Declaration> => {
    const processContentsPath = childPath(path, 'processContents');
    if (
        record.processContents !== undefined &&
        !processContentsValues.has(record.processContents)
    ) {
        invalidSchema('`processContents` must be `skip`, `lax` or `strict`', processContentsPath);
    }
    const processContents = (record.processContents ?? 'strict') as ProcessContents;
    const declarations = new Map<string, Declaration>();
    if (record.declarations !== undefined) {
        const getterPath = childPath(path, 'declarations');
        if (typeof record.declarations !== 'function') {
            invalidSchema('Expected `declarations` to be a function', getterPath);
        }
        const listPath = `${getterPath}()`;
        const list = checkArray(
            getterResult(record, record.declarations as () => unknown),
            listPath
        );
        for (const [index, declaration] of list.entries()) {
            const declarationPath = childPath(listPath, index);
            const compiled = compile(declaration, declarationPath);
            const name = expandedName(compiled.namespace, compiled.name);
            if (declarations.has(name)) {
                invalidSchema(
                    `${noun === 'element' ? 'Element' : 'Attribute'} ${describeName(compiled.namespace, compiled.name)} is declared twice`,
                    declarationPath
                );
            }
            declarations.set(name, compiled);
        }
    }
    const list = (property: 'namespace' | 'notNamespace'): readonly (string | null)[] | null => {
        if (record[property] === undefined) {
            return null;
        }
        const listPath = childPath(path, property);
        const namespaces = checkArray(record[property], listPath);
        for (const [index, namespace] of namespaces.entries()) {
            if (namespace !== null && (typeof namespace !== 'string' || namespace === '')) {
                invalidSchema(
                    'Expected a namespace name, or `null` for no namespace',
                    childPath(listPath, index)
                );
            }
        }
        return namespaces as readonly (string | null)[];
    };
    const allowed = list('namespace');
    const disallowed = list('notNamespace');
    if (allowed !== null && disallowed !== null) {
        invalidSchema('A wildcard has either `namespace` or `notNamespace`, not both', path);
    }
    if (allowed !== null) {
        if (allowed.length === 0) {
            invalidSchema(
                'A wildcard with no namespaces allows nothing; leave `namespace` out to allow any',
                childPath(path, 'namespace')
            );
        }
        return {
            processContents,
            declarations,
            allows: namespace => allowed.includes(namespace),
            label: `an ${noun} in ${listNamespaces(allowed)}`,
        };
    }
    if (disallowed !== null && disallowed.length > 0) {
        return {
            processContents,
            declarations,
            allows: namespace => !disallowed.includes(namespace),
            label: `an ${noun} not in ${listNamespaces(disallowed)}`,
        };
    }
    return { processContents, declarations, allows: () => true, label: `any ${noun}` };
};

/**
 * Checks and compiles a complex type.
 *
 * @param type - schema value of the type
 * @param path - path to it
 * @returns its compiled form
 */
const compileComplex = (type: object, path: string): CompiledComplex => {
    const cached = compiledComplexTypes.get(type);
    if (cached) {
        return cached;
    }
    const record = checkObject(
        type,
        [
            'kind',
            'name',
            'namespace',
            'key',
            'abstract',
            'attributes',
            'content',
            'text',
            'mixed',
            'ordered',
        ],
        path
    );
    const typeName = record.name === undefined ? null : checkName(record.name, path);
    for (const property of ['namespace', 'key']) {
        if (typeName === null && record[property] !== undefined) {
            invalidSchema(`\`${property}\` needs a \`name\``, childPath(path, property));
        }
    }

    const attributesPath = childPath(path, 'attributes');
    const attributes = new Map<string, CompiledAttribute>();
    const attributeKeys = new Set<string>();
    let anyAttribute: CompiledWildcard<CompiledAttribute> | null = null;
    if (record.attributes !== undefined) {
        const declarations = checkArray(record.attributes, attributesPath);
        for (const [index, declaration] of declarations.entries()) {
            const declarationPath = childPath(attributesPath, index);
            if ((declaration as { readonly kind?: unknown } | null)?.kind === 'anyAttribute') {
                if (anyAttribute !== null) {
                    invalidSchema(
                        'A complex type has at most one attribute wildcard',
                        declarationPath
                    );
                }
                anyAttribute = compileWildcard(
                    checkObject(
                        declaration,
                        ['kind', 'namespace', 'notNamespace', 'processContents', 'declarations'],
                        declarationPath
                    ),
                    'attribute',
                    declarationPath,
                    compileAttribute
                );
                continue;
            }
            const attribute = compileAttribute(declaration, declarationPath);
            const name = expandedName(attribute.namespace, attribute.name);
            if (attributes.has(name)) {
                invalidSchema(
                    `Attribute ${describeName(attribute.namespace, attribute.name)} is declared twice`,
                    declarationPath
                );
            }
            if (attributeKeys.has(attribute.key)) {
                shapeConflict(`Attribute key \`${attribute.key}\` is used twice`, declarationPath);
            }
            attributes.set(name, attribute);
            attributeKeys.add(attribute.key);
        }
    }

    if (record.content !== undefined && record.text !== undefined) {
        invalidSchema('A complex type has either `content` or `text`, not both', path);
    }
    const isMixed = isFlagged(record.mixed, childPath(path, 'mixed'));
    const isOrdered = isFlagged(record.ordered, childPath(path, 'ordered'));
    for (const [flag, isSet] of [
        ['mixed', isMixed],
        ['ordered', isOrdered],
    ] as const) {
        if (isSet && record.content === undefined) {
            invalidSchema(
                `\`${flag}\` needs \`content\`; for text only, use \`text\``,
                childPath(path, flag)
            );
        }
    }
    if (isMixed && record.ordered === false) {
        invalidSchema(
            'Mixed content is always ordered: its text has nowhere to go in keyed children',
            childPath(path, 'ordered')
        );
    }
    const compiled: CompiledComplex = {
        attributes,
        anyAttribute,
        kind: 'complex',
        name: typeName,
        namespace: checkNamespace(record.namespace, path),
        key: typeName === null ? null : checkKey(record.key, typeName, path),
        abstract: isFlagged(record.abstract, childPath(path, 'abstract')),
        mixed: isMixed,
        ordered: isMixed || isOrdered,
        content:
            record.content === undefined
                ? null
                : // eslint-disable-next-line @typescript-eslint/no-use-before-define -- Content holds elements, which hold types
                  compileContent(record.content, childPath(path, 'content')),
        text:
            record.text === undefined ? null : compileSimple(record.text, childPath(path, 'text')),
    };
    compiledComplexTypes.set(type, compiled);
    return compiled;
};

/**
 * Checks a type `xsi:type` may select for a declaration with `default` or `fixed`, and reads its `fixed` value
 * as the type does.
 *
 * @param record - the declaration
 * @param constraint - which of `default` and `fixed` it has
 * @param type - a type it lists
 * @param fixed - the `fixed` value as each type before it reads it, `null` for none yet
 * @param path - path to the type
 * @returns `fixed`, with this type's value added when it is valid for the type
 * @throws {XeneverInvalidSchemaError} when the type has no `text`
 * @throws {XeneverUnsupportedError} when its text may be a `QName`, which a value written in the schema can't
 * resolve
 */
const readConstraintAs = (
    record: Readonly<Record<string, unknown>>,
    constraint: 'default' | 'fixed',
    type: CompiledComplex,
    fixed: Map<CompiledComplex, FixedValue> | null,
    path: string
): Map<CompiledComplex, FixedValue> | null => {
    const { text } = type;
    if (text === null) {
        // An empty element of such a type can't be valid, as its `default` or `fixed` is text
        // ([XSD 1.0 Part 1 §3.3.4](https://www.w3.org/TR/xmlschema-1/#cvc-elt), clause 5.1.2), and in XSD no
        // type derived from one with simple content is without it.
        return invalidSchema(
            `An element with a \`${constraint}\` can only be given types with \`text\``,
            path
        );
    }
    if (text.hasQName) {
        throw new XeneverUnsupportedError(
            `\`${constraint}\` of a type that may be a QName is not supported: the schema has no namespaces to resolve it`,
            { path }
        );
    }
    if (constraint === 'default') {
        return fixed;
    }
    const values = fixed ?? new Map<CompiledComplex, FixedValue>();
    const lexical = record.fixed as string;
    try {
        values.set(type, { lexical, value: text.parse(lexical, noNamespaces) });
    } catch (error) {
        // Unreachable: reading a value throws only invalid values.
        /* c8 ignore next 3 */
        if (!(error instanceof InvalidValueError)) {
            throw error;
        }
        // Not valid for this type, so no value of it matches: the document decides whether one occurs.
    }
    return values;
};

/**
 * Checks and compiles the `types` of an element declaration: named complex types that aren't abstract, each
 * with a name and a key of its own among them and the declared type.
 *
 * @param record - the declaration, which has `types`
 * @param declared - its compiled type
 * @param path - path to the declaration
 * @returns the types by expanded name, and the declaration's `fixed` value as each reads it (see
 * `typesFixed`), `null` without one
 * @throws {XeneverInvalidSchemaError} when the declared type isn't a named complex type, or a listed type is
 * unnamed, abstract or named as another is, or has no `text` on a declaration with `default` or `fixed`
 * @throws {XeneverUnsupportedError} when a listed type's text may be a `QName` on a declaration with `default`
 * or `fixed`
 */
const compileTypes = (
    record: Readonly<Record<string, unknown>>,
    declared: CompiledType,
    path: string
): {
    readonly types: ReadonlyMap<string, CompiledComplex>;
    readonly fixed: ReadonlyMap<CompiledComplex, FixedValue> | null;
} => {
    const getterPath = childPath(path, 'types');
    if (typeof record.types !== 'function') {
        invalidSchema('Expected `types` to be a function', getterPath);
    }
    if (declared.kind !== 'complex' || declared.name === null) {
        return invalidSchema(
            '`types` needs the element to have a complex type with a `name`',
            getterPath
        );
    }
    const listPath = `${getterPath}()`;
    const list = checkArray(getterResult(record, record.types as () => unknown), listPath);
    const constraint = (['default', 'fixed'] as const).find(
        property => record[property] !== undefined
    );
    let fixed: Map<CompiledComplex, FixedValue> | null = null;
    const names = new Set([expandedName(declared.namespace, declared.name)]);
    const keys = new Set([declared.key]);
    const types = new Map<string, CompiledComplex>();
    for (const [index, type] of list.entries()) {
        const typePath = childPath(listPath, index);
        if ((type as { readonly kind?: unknown } | null)?.kind !== 'complex') {
            invalidSchema('Expected a complex type', typePath);
        }
        const compiled = compileComplex(type as object, typePath);
        if (compiled.name === null) {
            return invalidSchema('A type `xsi:type` may select needs a `name`', typePath);
        }
        if (compiled.abstract) {
            invalidSchema(
                'An abstract type can not be selected by `xsi:type`, so can not be listed',
                typePath
            );
        }
        if (constraint !== undefined) {
            fixed = readConstraintAs(record, constraint, compiled, fixed, typePath);
        }
        const name = expandedName(compiled.namespace, compiled.name);
        if (names.has(name)) {
            invalidSchema(
                `Type ${describeName(compiled.namespace, compiled.name)} is listed twice, or is the type of the element`,
                typePath
            );
        }
        if (keys.has(compiled.key)) {
            shapeConflict(
                `Type key \`${compiled.key!}\` is used by two types of one element; set \`key\` on one`,
                typePath
            );
        }
        names.add(name);
        keys.add(compiled.key);
        types.set(name, compiled);
    }
    return { types, fixed };
};

/**
 * Properties of a particle rather than its declaration.
 */
const occursProperties: ReadonlySet<string> = new Set(['minOccurs', 'maxOccurs']);

/**
 * Whether two schema values are the same data: functions (lazy getters) by identity, `minOccurs` and
 * `maxOccurs` of the outermost value ignored, as they belong to the particle rather than the declaration.
 *
 * @param a - one value
 * @param b - another
 * @param isOutermost - whether these are the declarations themselves
 * @returns whether they are equal
 */
const isSameDeclaration = (a: unknown, b: unknown, isOutermost = false): boolean => {
    if (a === b) {
        return true;
    }
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
        return false;
    }
    const keys = (value: object): string[] =>
        Object.keys(value).filter(key => !(isOutermost && occursProperties.has(key)));
    // Compared as sets, so the order properties were written in doesn't matter
    const keysA = keys(a);
    const keysB = new Set(keys(b));
    return (
        keysA.length === keysB.size &&
        keysA.every(
            key =>
                keysB.has(key) &&
                isSameDeclaration(
                    (a as Readonly<Record<string, unknown>>)[key],
                    (b as Readonly<Record<string, unknown>>)[key]
                )
        )
    );
};

/**
 * Key of the elements that wildcards matched, in `children`.
 */
export const anyKey = '#any';

/**
 * Kinds of model groups.
 */
const modelGroupKinds: ReadonlySet<unknown> = new Set(['sequence', 'choice', 'all']);

/**
 * Count of a key in a content model: at most once (1), or more than once (2).
 */
type Count = 1 | 2;

/**
 * Builds a content model's pattern, and what parsing its children needs.
 */
class ContentCompiler {
    readonly #elements = new Map<
        string,
        { readonly compiled: CompiledElement; readonly raw: unknown }
    >();
    readonly #keys = new Map<string, string>();
    readonly #wildcards = new Map<string, CompiledWildcard<CompiledElement>>();

    /**
     * Compiles a content model.
     *
     * @param group - its model group
     * @param path - path to it
     * @returns the compiled content
     */
    public compile(group: unknown, path: string): CompiledContent {
        const record = checkObject(group, ['kind', 'particles', 'minOccurs', 'maxOccurs'], path);
        if (!modelGroupKinds.has(record.kind)) {
            invalidSchema(`Expected a model group, not ${JSON.stringify(record.kind)}`, path);
        }
        const { pattern, counts } = this.#particle(record, path);
        const elements = new Map<string, CompiledElement>();
        for (const [name, { compiled }] of this.#elements) {
            elements.set(name, compiled);
        }
        return {
            elements,
            wildcards: this.#wildcards,
            model: new ContentModel(pattern),
            keys: [...counts].map(([key, count]) => ({ key, array: count === 2 })),
        };
    }

    /**
     * Compiles a particle: its pattern, and the count of each key in it (see `Counts` in `infer.ts`, which
     * computes the same for the type).
     *
     * @param particle - schema value of the particle
     * @param path - path to it
     * @returns its pattern and counts, keys in declaration order
     */
    #particle(
        particle: unknown,
        path: string
    ): { readonly pattern: Pattern; readonly counts: ReadonlyMap<string, Count> } {
        const kind = (particle as { readonly kind?: unknown } | null)?.kind;
        if (modelGroupKinds.has(kind)) {
            return this.#group(particle, kind as 'all' | 'choice' | 'sequence', path);
        }
        if (kind === 'any') {
            const record = checkObject(
                particle,
                [
                    'kind',
                    'namespace',
                    'notNamespace',
                    'processContents',
                    'declarations',
                    'minOccurs',
                    'maxOccurs',
                ],
                path
            );
            const occurs = checkOccurs(record, path);
            const wildcard = compileWildcard(record, 'element', path, compileElement);
            const id = `#any${this.#wildcards.size + 1}`;
            this.#wildcards.set(id, wildcard);
            const symbol: ModelSymbol = {
                id,
                isWildcard: true,
                isAbstract: false,
                label: wildcard.label,
                matches: child => wildcard.allows(child.namespace),
            };
            return {
                pattern: { kind: 'repeat', item: { kind: 'symbol', symbol }, ...occurs },
                // A wildcard's elements are always an array, whatever its `maxOccurs`.
                counts: new Map([[anyKey, 2]]),
            };
        }
        let declaration: unknown = particle;
        let declarationPath = path;
        let occurs;
        if (kind === 'lazy') {
            const record = checkObject(particle, ['kind', 'get', 'minOccurs', 'maxOccurs'], path);
            if (typeof record.get !== 'function') {
                invalidSchema('Expected `get` to be a function', childPath(path, 'get'));
            }
            occurs = checkOccurs(record, path);
            declaration = getterResult(record, record.get as () => unknown);
            declarationPath = `${childPath(path, 'get')}()`;
        } else {
            occurs = checkOccurs(checkObject(particle, elementProperties, path), path);
        }
        const compiled = this.#element(declaration, declarationPath);
        const symbolName = expandedName(compiled.namespace, compiled.name);
        const symbol: ModelSymbol = {
            id: symbolName,
            isWildcard: false,
            isAbstract: compiled.abstract,
            label: describeName(compiled.namespace, compiled.name),
            // An abstract element matches no child, so one that must occur makes the model unsatisfiable.
            matches: compiled.abstract ? () => false : child => child.name === symbolName,
        };
        return {
            pattern: { kind: 'repeat', item: { kind: 'symbol', symbol }, ...occurs },
            counts: new Map([[compiled.key, occurs.max > 1 ? 2 : 1]]),
        };
    }

    /**
     * Compiles an element declaration in this model: Element Declarations Consistent
     * ([XSD 1.1 Part 1 §3.8.6.3](https://www.w3.org/TR/xmlschema11-1/#cos-element-consistent)) needs every
     * element of one name to have the same declaration, so children of a name are read one way and share a
     * key, and two names never share a key.
     *
     * @param declaration - schema value of the declaration
     * @param path - path to it
     * @returns its compiled form
     */
    #element(declaration: unknown, path: string): CompiledElement {
        const compiled = compileElement(declaration, path);
        const name = expandedName(compiled.namespace, compiled.name);
        const existing = this.#elements.get(name);
        if (existing) {
            if (!isSameDeclaration(existing.raw, declaration, true)) {
                const described = describeName(compiled.namespace, compiled.name);
                // Same type, so consistent for XML Schema, but read into one key with different
                // `default`, `fixed`, `nillable`...
                if (
                    isSameDeclaration(
                        (existing.raw as { readonly type?: unknown }).type,
                        (declaration as { readonly type?: unknown }).type
                    )
                ) {
                    shapeConflict(
                        `Element ${described} is declared twice in one content model with the same type but otherwise differently, so its values can't share a key`,
                        path
                    );
                }
                invalidSchema(
                    `Element ${described} is declared twice in one content model, with different types`,
                    path
                );
            }
            return existing.compiled;
        }
        const keyOwner = this.#keys.get(compiled.key);
        if (keyOwner !== undefined) {
            shapeConflict(
                `Key \`${compiled.key}\` is used by two elements in one content model; set \`key\` on one`,
                path
            );
        }
        this.#elements.set(name, { compiled, raw: declaration });
        this.#keys.set(compiled.key, name);
        return compiled;
    }

    /**
     * Compiles a model group.
     *
     * @param group - schema value of the group
     * @param kind - its kind
     * @param path - path to it
     * @returns its pattern and counts
     */
    #group(
        group: unknown,
        kind: 'all' | 'choice' | 'sequence',
        path: string
    ): { readonly pattern: Pattern; readonly counts: ReadonlyMap<string, Count> } {
        const record = checkObject(group, ['kind', 'particles', 'minOccurs', 'maxOccurs'], path);
        const occurs = checkOccurs(record, path);
        const particlesPath = childPath(path, 'particles');
        const particles = checkArray(record.particles, particlesPath);
        if (kind === 'all' && occurs.max > 1) {
            invalidSchema('An `all` group occurs at most once', childPath(path, 'maxOccurs'));
        }
        const compiled = particles.map((particle, index) => {
            const particlePath = childPath(particlesPath, index);
            const particleKind = (particle as { readonly kind?: unknown } | null)?.kind;
            if (kind === 'all' && !['element', 'lazy', 'any'].includes(particleKind as string)) {
                invalidSchema('An `all` group holds only elements and wildcards', particlePath);
            }
            return this.#particle(particle, particlePath);
        });

        const counts = new Map<string, Count>();
        for (const particle of compiled) {
            for (const [key, count] of particle.counts) {
                const existing = counts.get(key);
                if (existing === undefined) {
                    counts.set(key, count);
                } else {
                    // In a choice one branch occurs, so the largest count; otherwise every particle may.
                    counts.set(key, kind === 'choice' ? (Math.max(existing, count) as Count) : 2);
                }
            }
        }
        if (occurs.max > 1) {
            for (const key of counts.keys()) {
                counts.set(key, 2);
            }
        }

        if (kind === 'all') {
            const parts = compiled.map(({ pattern }): AllPart => {
                // Each particle of an `all` group compiled to a repeated symbol.
                const repeat = pattern as Extract<Pattern, { readonly kind: 'repeat' }>;
                const { min, max } = repeat;
                return {
                    min,
                    max,
                    symbol: (repeat.item as Extract<Pattern, { readonly kind: 'symbol' }>).symbol,
                };
            });
            return { counts, pattern: { parts, kind: 'all', optional: occurs.min === 0 } };
        }
        const items = compiled.map(({ pattern }) => pattern);
        return {
            pattern: {
                kind: 'repeat',
                item: kind === 'choice' ? { kind: 'choice', items } : { kind: 'sequence', items },
                ...occurs,
            },
            counts,
        };
    }
}

/**
 * Checks and compiles a content model.
 *
 * @param group - its model group
 * @param path - path to it
 * @returns the compiled content
 */
const compileContent = (group: unknown, path: string): CompiledContent => {
    const compiler = new ContentCompiler();
    return compiler.compile(group, path);
};

/**
 * Collects the identity constraints a root declaration may hold, through content models, `x.lazy` references,
 * wildcards' `declarations` and elements' `types`, each declaration and type once. Constraint names are one
 * symbol space ([XSD 1.0 Part 1 §3.11.1](https://www.w3.org/TR/xmlschema-1/#Identity-constraint_Definition_details)),
 * which is how a keyref's `refer` names one: node tables are kept by name.
 */
class IdentityCollector {
    readonly #visited = new Set<object>();
    readonly #constraints = new Map<
        string,
        { readonly identity: CompiledIdentity; readonly path: string }
    >();

    /**
     * Checks the constraints collected: each keyref refers to a `key` or `unique` constraint among them, with as
     * many fields.
     *
     * @throws {XeneverInvalidSchemaError} at the first keyref, in the order collected, that doesn't
     */
    public checkRefers(): void {
        for (const { identity, path } of this.#constraints.values()) {
            const { refer } = identity;
            if (refer === null) {
                continue;
            }
            const referPath = childPath(path, 'refer');
            const target = this.#constraints.get(refer.id)?.identity;
            if (!target) {
                invalidSchema(
                    `The ${identity.label} refers to ${refer.label}, which names no identity constraint of the root or of an element it may hold`,
                    referPath
                );
            }
            if (target!.kind === 'keyref') {
                invalidSchema(
                    `The ${identity.label} refers to the ${target!.label}, which is not a key or unique constraint`,
                    referPath
                );
            }
            if (target!.fields.length !== identity.fields.length) {
                invalidSchema(
                    `The ${identity.label} has ${identity.fields.length} fields, and the ${target!.label} it refers to ${target!.fields.length}`,
                    childPath(path, 'fields')
                );
            }
        }
    }

    /**
     * Collects the constraints of an element declaration, and of every declaration it may hold.
     *
     * @param record - the declaration, already compiled
     * @param path - path to it
     * @throws {XeneverInvalidSchemaError} when a constraint has the name of a different one already collected
     */
    public element(record: Readonly<Record<string, unknown>>, path: string): void {
        if (this.#visited.has(record)) {
            return;
        }
        this.#visited.add(record);
        const identityPath = childPath(path, 'identity');
        const identities = compiledElements.get(record)!.identity ?? [];
        for (const [index, identity] of identities.entries()) {
            this.#add(identity, childPath(identityPath, index));
        }
        this.#type(record.type, childPath(path, 'type'));
        if (record.types === undefined) {
            return;
        }
        const listPath = `${childPath(path, 'types')}()`;
        const types = getterResult(record, record.types as () => unknown) as readonly unknown[];
        for (const [index, type] of types.entries()) {
            this.#type(type, childPath(listPath, index));
        }
    }

    /**
     * Collects a constraint.
     *
     * @param identity - the constraint
     * @param path - path to it
     * @throws {XeneverInvalidSchemaError} when it has the name of a different one already collected
     */
    #add(identity: CompiledIdentity, path: string): void {
        const existing = this.#constraints.get(identity.id);
        if (!existing) {
            this.#constraints.set(identity.id, { identity, path });
        } else if (existing.identity.signature !== identity.signature) {
            invalidSchema(
                `The ${identity.label} is declared twice, differently: an identity constraint's name is unique among those the root may hold`,
                path
            );
        }
    }

    /**
     * Collects the constraints of the declarations a type may hold.
     *
     * @param type - the type, already compiled
     * @param path - path to it
     */
    #type(type: unknown, path: string): void {
        const record = type as Readonly<Record<string, unknown>>;
        if (record.kind !== 'complex' || this.#visited.has(record)) {
            return;
        }
        this.#visited.add(record);
        if (record.content !== undefined) {
            this.#particle(record.content, childPath(path, 'content'));
        }
    }

    /**
     * Collects the constraints of the declarations a particle may hold.
     *
     * @param particle - the particle, already compiled
     * @param path - path to it
     */
    #particle(particle: unknown, path: string): void {
        const record = particle as Readonly<Record<string, unknown>>;
        if (modelGroupKinds.has(record.kind)) {
            const particlesPath = childPath(path, 'particles');
            for (const [index, item] of (record.particles as readonly unknown[]).entries()) {
                this.#particle(item, childPath(particlesPath, index));
            }
        } else if (record.kind === 'any') {
            if (record.declarations !== undefined) {
                const listPath = `${childPath(path, 'declarations')}()`;
                const declarations = getterResult(
                    record,
                    record.declarations as () => unknown
                ) as readonly Readonly<Record<string, unknown>>[];
                for (const [index, declaration] of declarations.entries()) {
                    this.element(declaration, childPath(listPath, index));
                }
            }
        } else if (record.kind === 'lazy') {
            this.element(
                getterResult(record, record.get as () => unknown) as Readonly<
                    Record<string, unknown>
                >,
                `${childPath(path, 'get')}()`
            );
        } else {
            this.element(record, path);
        }
    }
}

/**
 * Root declarations whose identity constraints were checked.
 */
const checkedRoots = new WeakSet<object>();

/**
 * Checks and compiles a root declaration, as {@link compileElement} does, then checks the identity constraints it
 * may hold, once per root: names are unique among them, and each keyref refers to a `key` or `unique` constraint
 * among them with as many fields. Done when the schema compiles, so a schema that breaks this fails whether or
 * not a document reaches the constraints.
 *
 * @param declaration - schema value of the declaration
 * @returns its compiled form
 * @throws {XeneverInvalidSchemaError} when the declaration, or anything in it, is invalid, or its identity
 * constraints are
 * @throws {XeneverUnsupportedError} when it uses something xenever doesn't support
 */
export const compileRoot = (declaration: unknown): CompiledElement => {
    const compiled = compileElement(declaration, '/');
    const record = declaration as Readonly<Record<string, unknown>>;
    if (!checkedRoots.has(record)) {
        const collector = new IdentityCollector();
        collector.element(record, '/');
        collector.checkRefers();
        checkedRoots.add(record);
    }
    return compiled;
};

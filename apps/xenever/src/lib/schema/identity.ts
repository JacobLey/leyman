import type { XeneverInvalidSchemaError } from '#internal/lib/errors.js';
import { ncNamePattern } from '#internal/lib/simple/names.js';
import { xmlNamespace } from '#internal/lib/xml/nodes.js';
import { checkArray, checkObject, checkString, childPath, invalidSchema } from './check.js';

/**
 * A name test of a path step: absent `namespace` matches any namespace (`*`), and absent `localName` any local
 * name (`*`, `p:*`).
 */
export interface NameTest {
    readonly namespace?: string | null;
    readonly localName?: string;
}

/**
 * One path of a selector or field, as the XPath subset of identity constraints writes it
 * ([XSD 1.0 Part 1 §3.11.6](https://www.w3.org/TR/xmlschema-1/#coss-identity-constraint)):
 * `('.//')? Step ('/' Step)*`, a field's last step possibly an attribute.
 */
export interface IdentityPath {
    /**
     * Whether it starts with `.//`: from the element and each of its descendants, rather than the element alone.
     */
    readonly isDeep: boolean;
    /**
     * Each child step, `null` for `.` (the element itself).
     */
    readonly steps: readonly (NameTest | null)[];
    /**
     * The attribute a field ends with, `null` when it selects elements.
     */
    readonly attribute: NameTest | null;
}

/**
 * Whether a name matches a name test.
 *
 * @param test - what the name must match
 * @param namespace - namespace name of the name, `null` for none
 * @param localName - its local name
 * @returns whether it matches
 */
export const isNameMatch = (test: NameTest, namespace: string | null, localName: string): boolean =>
    (test.namespace === undefined || test.namespace === namespace) &&
    (test.localName === undefined || test.localName === localName);

/**
 * A token of a path ([§3.11.6](https://www.w3.org/TR/xmlschema-1/#coss-identity-constraint), production 5):
 * punctuation, a name test (`prefix` `null` when unprefixed, `localName` `null` for `*`), or an axis name, which
 * is a name followed by `::`.
 */
type Token =
    | { readonly kind: '.' | '/' | '//' | '@' | '|' }
    | { readonly kind: 'axis'; readonly axis: string }
    | { readonly kind: 'name'; readonly prefix: string | null; readonly localName: string | null };

/**
 * An NCName at a position of a text.
 */
const ncNameAt = new RegExp(ncNamePattern.source.slice(1, -1), 'vy');

/**
 * Whitespace, which may come before or after any token.
 */
const whitespace = /[\t\n\r ]*/vy;

/**
 * Tokens of one character.
 */
const punctuation: ReadonlySet<string> = new Set(['.', '/', '@', '|']);

/**
 * Two-character tokens of XPath outside the subset: the parent step, and an axis without its name.
 */
const disallowedPairs: ReadonlySet<string> = new Set(['..', '::']);

/**
 * Reads the NCName at a position.
 *
 * @param text - the path
 * @param index - where to read
 * @returns the NCName, or `null` when there is none there
 */
const readNcName = (text: string, index: number): string | null => {
    ncNameAt.lastIndex = index;
    return ncNameAt.exec(text)?.[0] ?? null;
};

/**
 * Skips whitespace.
 *
 * @param text - the path
 * @param index - where to start
 * @returns where the whitespace ends
 */
const skipWhitespace = (text: string, index: number): number => {
    whitespace.lastIndex = index;
    // Matches always, possibly nothing.
    return index + whitespace.exec(text)![0].length;
};

/**
 * Reads the token that starts with a name: an axis name, a prefixed name test, or a local name.
 *
 * @param text - the path
 * @param index - where the name starts
 * @param fail - throws what is wrong
 * @returns the token, and where it ends
 */
const readNameToken = (
    text: string,
    index: number,
    fail: (message: string) => never
): readonly [Token, number] => {
    const name = readNcName(text, index) ?? fail(`Unexpected ${JSON.stringify(text[index])}`);
    const end = index + name.length;
    // `child::`, possibly with whitespace before the `::`.
    const afterSpace = skipWhitespace(text, end);
    if (text.startsWith('::', afterSpace)) {
        return [{ kind: 'axis', axis: name }, afterSpace + 2];
    }
    // A QName has no whitespace around its colon.
    if (text[end] !== ':') {
        return [{ kind: 'name', prefix: null, localName: name }, end];
    }
    if (text[end + 1] === '*') {
        return [{ kind: 'name', prefix: name, localName: null }, end + 2];
    }
    const localName =
        readNcName(text, end + 1) ?? fail(`Expected a local name or \`*\` after \`${name}:\``);
    return [{ kind: 'name', prefix: name, localName }, end + 1 + localName.length];
};

/**
 * Reads the token at a position.
 *
 * @param text - the path
 * @param index - where it starts, after any whitespace
 * @param fail - throws what is wrong
 * @returns the token, and where it ends
 */
const readToken = (
    text: string,
    index: number,
    fail: (message: string) => never
): readonly [Token, number] => {
    const pair = text.slice(index, index + 2);
    if (disallowedPairs.has(pair)) {
        fail(`\`${pair}\` is not allowed`);
    }
    if (pair === '//') {
        return [{ kind: '//' }, index + 2];
    }
    const character = text[index]!;
    if (punctuation.has(character)) {
        return [{ kind: character as '.' | '/' | '@' | '|' }, index + 1];
    }
    if (character === '*') {
        return [{ kind: 'name', prefix: null, localName: null }, index + 1];
    }
    return readNameToken(text, index, fail);
};

/**
 * Splits a path into tokens, the longest possible each time.
 *
 * @param text - the path
 * @param fail - throws what is wrong
 * @returns its tokens
 */
const tokenize = (text: string, fail: (message: string) => never): readonly Token[] => {
    const tokens: Token[] = [];
    for (let index = skipWhitespace(text, 0); index < text.length; ) {
        const [token, end] = readToken(text, index, fail);
        tokens.push(token);
        index = skipWhitespace(text, end);
    }
    return tokens;
};

/**
 * Whether a token is an axis name.
 *
 * @param token - a token, `undefined` past the end
 * @param axis - name of the axis
 * @returns whether it names the axis
 */
const isAxis = (token: Token | undefined, axis: string): boolean =>
    token?.kind === 'axis' && token.axis === axis;

/**
 * How errors name a token.
 *
 * @param token - a token, `undefined` past the end
 * @returns e.g. `` `/` ``, or `the end`
 */
const describeToken = (token: Token | undefined): string => {
    if (token === undefined) {
        return 'the end';
    }
    if (token.kind === 'axis') {
        return `\`${token.axis}::\``;
    }
    return token.kind === 'name' ? 'a name' : `\`${token.kind}\``;
};

/**
 * Parses a selector or a field: paths joined by `|`. Unprefixed names are in no namespace, as XPath 1.0 has no
 * default namespace for them.
 *
 * @param text - the XPath expression
 * @param isField - whether it is a field, whose paths may end with an attribute
 * @param resolve - the namespace name of a prefix, `undefined` when it is not bound
 * @param fail - throws what is wrong
 * @returns its paths
 */
export const parseIdentityPaths = (
    text: string,
    isField: boolean,
    resolve: (prefix: string) => string | undefined,
    fail: (message: string) => never
): readonly IdentityPath[] => {
    const tokens = tokenize(text, fail);
    let position = 0;
    const peek = (offset = 0): Token | undefined => tokens[position + offset];

    const nameTest = (): NameTest => {
        const token = peek();
        if (token?.kind !== 'name') {
            return fail(`Expected a name test, not ${describeToken(token)}`);
        }
        position++;
        if (token.prefix === null) {
            return token.localName === null ? {} : { namespace: null, localName: token.localName };
        }
        const namespace =
            token.prefix === 'xml'
                ? xmlNamespace
                : (resolve(token.prefix) ??
                  fail(`The prefix \`${token.prefix}\` is not bound to a namespace`));
        return token.localName === null ? { namespace } : { namespace, localName: token.localName };
    };

    const step = (): NameTest | null => {
        const token = peek();
        if (token?.kind === '.') {
            position++;
            return null;
        }
        if (token?.kind === 'axis') {
            if (token.axis !== 'child') {
                fail(
                    `The axis \`${token.axis}\` is not allowed; only \`child\`${isField ? ' and `attribute`' : ''}`
                );
            }
            position++;
        }
        return nameTest();
    };

    const path = (): IdentityPath => {
        const isDeep = peek()?.kind === '.' && peek(1)?.kind === '//';
        if (isDeep) {
            position += 2;
        }
        const steps: (NameTest | null)[] = [];
        for (;;) {
            const token = peek();
            if (isField && (token?.kind === '@' || isAxis(token, 'attribute'))) {
                position++;
                return { isDeep, steps, attribute: nameTest() };
            }
            steps.push(step());
            if (peek()?.kind !== '/') {
                return { isDeep, steps, attribute: null };
            }
            position++;
        }
    };

    const paths = [path()];
    while (peek()?.kind === '|') {
        position++;
        paths.push(path());
    }
    if (position < tokens.length) {
        fail(`Unexpected ${describeToken(peek())}`);
    }
    return paths;
};

/**
 * A field of an identity constraint, ready to evaluate.
 */
export interface CompiledField {
    /**
     * As written, for errors.
     */
    readonly text: string;
    readonly paths: readonly IdentityPath[];
}

/**
 * An identity constraint, ready to evaluate.
 */
export interface CompiledIdentity {
    readonly kind: 'key' | 'keyref' | 'unique';
    /**
     * Its expanded name, which a keyref's `refer` names it by.
     */
    readonly id: string;
    /**
     * How errors name it, e.g. ``key `id` ``.
     */
    readonly label: string;
    readonly selector: readonly IdentityPath[];
    readonly fields: readonly CompiledField[];
    /**
     * The `key` or `unique` constraint a keyref refers to: its expanded name, and how errors name it.
     */
    readonly refer: { readonly id: string; readonly label: string } | null;
    /**
     * What it is, as text: two constraints of one name with the same signature are the same constraint, which
     * may be on several declarations (a declaration written twice, or copied).
     */
    readonly signature: string;
}

/**
 * Properties an identity constraint may have.
 */
const identityProperties = [
    'kind',
    'name',
    'namespace',
    'selector',
    'fields',
    'namespaces',
    'refer',
] as const;

/**
 * Kinds of identity constraints.
 */
const identityKinds: ReadonlySet<unknown> = new Set(['key', 'keyref', 'unique']);

/**
 * Checks the name and namespace of an identity constraint, or of the one a keyref refers to.
 *
 * @param record - the constraint, or `refer`
 * @param path - path to it
 * @param describe - how errors name a name in a namespace
 * @returns its expanded name, and its label without the kind
 * @throws {XeneverInvalidSchemaError} when the name isn't an NCName, or the namespace is empty
 */
const checkIdentityName = (
    record: Readonly<Record<string, unknown>>,
    path: string,
    describe: (namespace: string | null, localName: string) => string
): { readonly id: string; readonly label: string } => {
    if (typeof record.name !== 'string' || !ncNamePattern.test(record.name)) {
        invalidSchema(
            `Name ${JSON.stringify(record.name)} is not an NCName`,
            childPath(path, 'name')
        );
    }
    const namespacePath = childPath(path, 'namespace');
    const namespace = checkString(record.namespace, namespacePath) ?? null;
    if (namespace === '') {
        invalidSchema(
            'A namespace name must not be empty; leave it out for no namespace',
            namespacePath
        );
    }
    const name = record.name as string;
    return { id: JSON.stringify([namespace, name]), label: describe(namespace, name) };
};

/**
 * Lists the properties of an object, to accept any of them.
 *
 * @param value - an object, or something else
 * @returns its properties, none when it isn't an object
 */
const propertiesOf = (value: unknown): readonly string[] =>
    typeof value === 'object' && value !== null ? Object.keys(value) : [];

/**
 * Checks and compiles the identity constraints of an element declaration. The first problem found throws a
 * {@link XeneverInvalidSchemaError} with its path in the declaration.
 *
 * @param value - its `identity` property
 * @param path - path to it
 * @param describe - how errors name a name in a namespace
 * @returns the compiled constraints, `null` when there are none
 * @throws {XeneverInvalidSchemaError} when a constraint is invalid, a path isn't in the XPath subset or uses a
 * prefix `namespaces` doesn't bind, or two constraints of the declaration share a name
 */
export const compileIdentities = (
    value: unknown,
    path: string,
    describe: (namespace: string | null, localName: string) => string
): readonly CompiledIdentity[] | null => {
    if (value === undefined) {
        return null;
    }
    const constraints = checkArray(value, path);
    const ids = new Set<string>();
    const compiled = constraints.map((constraint, index): CompiledIdentity => {
        const constraintPath = childPath(path, index);
        const record = checkObject(constraint, identityProperties, constraintPath);
        if (!identityKinds.has(record.kind)) {
            invalidSchema(
                `Expected an identity constraint (\`key\`, \`keyref\` or \`unique\`), not ${JSON.stringify(record.kind)}`,
                constraintPath
            );
        }
        const kind = record.kind as CompiledIdentity['kind'];
        const { id, label } = checkIdentityName(record, constraintPath, describe);
        if (ids.has(id)) {
            invalidSchema(`Identity constraint ${label} is declared twice`, constraintPath);
        }
        ids.add(id);

        const namespacesPath = childPath(constraintPath, 'namespaces');
        const namespaces =
            record.namespaces === undefined
                ? {}
                : // Any prefix is a property; only the values are checked.
                  checkObject(record.namespaces, propertiesOf(record.namespaces), namespacesPath);
        for (const [prefix, namespace] of Object.entries(namespaces)) {
            if (typeof namespace !== 'string' || namespace === '' || !ncNamePattern.test(prefix)) {
                invalidSchema(
                    'Expected an NCName prefix bound to a namespace name',
                    childPath(namespacesPath, prefix)
                );
            }
        }
        const parse = (text: unknown, isField: boolean, at: string): readonly IdentityPath[] => {
            if (typeof text !== 'string') {
                return invalidSchema('Expected a string', at);
            }
            return parseIdentityPaths(
                text,
                isField,
                prefix =>
                    Object.hasOwn(namespaces, prefix) ? (namespaces[prefix] as string) : undefined,
                message =>
                    invalidSchema(
                        `${isField ? 'Field' : 'Selector'} ${JSON.stringify(text)} is not in the XPath subset of identity constraints: ${message}`,
                        at
                    )
            );
        };

        const selector = parse(record.selector, false, childPath(constraintPath, 'selector'));
        const fieldsPath = childPath(constraintPath, 'fields');
        const fields = checkArray(record.fields, fieldsPath).map((field, fieldIndex) => ({
            text: field as string,
            paths: parse(field, true, childPath(fieldsPath, fieldIndex)),
        }));
        if (fields.length === 0) {
            invalidSchema('An identity constraint has at least one field', fieldsPath);
        }

        const referPath = childPath(constraintPath, 'refer');
        if ((kind === 'keyref') !== (record.refer !== undefined)) {
            invalidSchema(
                kind === 'keyref'
                    ? 'A keyref needs `refer`, the key or unique constraint it refers to'
                    : `Only a keyref has \`refer\``,
                kind === 'keyref' ? constraintPath : referPath
            );
        }
        // A key or unique constraint itself may be given as `refer`, so its other properties are allowed.
        const refer =
            kind === 'keyref'
                ? checkIdentityName(
                      checkObject(record.refer, identityProperties, referPath),
                      referPath,
                      describe
                  )
                : null;
        return {
            kind,
            id,
            selector,
            fields,
            refer,
            label: `${kind} ${label}`,
            signature: JSON.stringify([
                kind,
                selector,
                fields.map(field => field.paths),
                refer?.id ?? null,
            ]),
        };
    });
    return compiled.length === 0 ? null : compiled;
};

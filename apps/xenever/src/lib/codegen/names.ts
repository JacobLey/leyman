/**
 * Words a generated identifier can't be: JavaScript's reserved words, those reserved in strict mode and
 * modules, names strict mode can't bind, and globals best not shadowed
 * ([ECMAScript §13.1](https://tc39.es/ecma262/#sec-keywords-and-reserved-words)). `x` is the import of the
 * builders.
 */
const reservedValues: ReadonlySet<string> = new Set([
    'arguments',
    'await',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'enum',
    'eval',
    'export',
    'extends',
    'false',
    'finally',
    'for',
    'function',
    'if',
    'implements',
    'import',
    'in',
    'Infinity',
    'instanceof',
    'interface',
    'let',
    'NaN',
    'new',
    'null',
    'package',
    'private',
    'protected',
    'public',
    'return',
    'static',
    'super',
    'switch',
    'this',
    'throw',
    'true',
    'try',
    'typeof',
    'undefined',
    'var',
    'void',
    'while',
    'with',
    'x',
    'yield',
]);

/**
 * Names a generated type can't have: TypeScript's built-in type names, besides the reserved words.
 */
const reservedTypes: ReadonlySet<string> = new Set([
    ...reservedValues,
    'any',
    'bigint',
    'boolean',
    'never',
    'number',
    'object',
    'string',
    'symbol',
    'unknown',
]);

/**
 * Characters that can't be in an identifier: XML names may also hold `-`, `.` and a few others.
 */
const nonIdentifier = /[^\p{ID_Continue}$]+/gv;

/**
 * Characters that may start an identifier.
 */
const identifierStart = /^[\p{ID_Start}$_]/v;

/**
 * A leading run of capitals, and the character after it.
 */
const leadingCapitals = /^(?<capitals>\p{Lu}+)(?<next>.?)/v;

/**
 * PascalCase identifier of an XML name: words split at characters an identifier can't hold, each capitalized,
 * the rest of each word kept as written (`purchase-order` and `purchaseOrder` are both `PurchaseOrder`).
 *
 * @param name - an NCName
 * @returns the identifier, before collisions and reserved words are handled
 */
export const pascalCase = (name: string): string => {
    const joined = name
        .split(nonIdentifier)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
    return identifierStart.test(joined) ? joined : `_${joined}`;
};

/**
 * CamelCase identifier of an XML name: its {@link pascalCase} form with the leading capitals lowered, all but
 * the last of a run that starts a word (`USState` is `usState`, `URL` is `url`).
 *
 * @param name - an NCName
 * @returns the identifier, before collisions and reserved words are handled
 */
export const camelCase = (name: string): string =>
    pascalCase(name).replace(leadingCapitals, (_match, capitals: string, next: string) =>
        capitals.length > 1 && /\p{Ll}/v.test(next)
            ? `${capitals.slice(0, -1).toLowerCase()}${capitals.slice(-1)}${next}`
            : `${capitals.toLowerCase()}${next}`
    );

/**
 * Identifiers already taken in one TypeScript declaration space.
 */
export class Names {
    readonly #taken = new Set<string>();
    readonly #reserved: ReadonlySet<string>;

    /**
     * @param space - `value` for consts, `type` for types
     */
    public constructor(space: 'type' | 'value') {
        this.#reserved = space === 'type' ? reservedTypes : reservedValues;
    }

    /**
     * Whether an identifier is free.
     *
     * @param identifier - a generated identifier
     * @returns whether it is neither taken nor reserved
     */
    public isFree(identifier: string): boolean {
        return !this.#taken.has(identifier) && !this.#reserved.has(identifier);
    }

    /**
     * Takes an identifier.
     *
     * @param identifier - a free identifier
     */
    public take(identifier: string): void {
        this.#taken.add(identifier);
    }
}

/**
 * Takes the first identifier free in every space: the base, then the base with `_2`, `_3`... Names are taken
 * in document order, so the same schema always gets the same identifiers.
 *
 * @param base - the identifier wanted
 * @param spaces - declaration spaces it must be free in
 * @returns the identifier taken
 */
export const allocate = (base: string, spaces: readonly Names[]): string => {
    let identifier = base;
    let suffix = 1;
    while (spaces.some(space => !space.isFree(identifier))) {
        suffix++;
        identifier = `${base}_${suffix}`;
    }
    for (const space of spaces) {
        space.take(identifier);
    }
    return identifier;
};

import type {
    Any,
    AnyAttribute,
    AtomicKind,
    AtomicType,
    Attribute,
    ComplexType,
    DateKind,
    Element,
    IdentityConstraint,
    ModelGroup,
    Particle,
    SimpleType,
    Type,
} from '#internal/lib/schema/ir.js';
import type { XsdSchemaSet } from '#internal/lib/xsd/build.js';
import { XeneverUnsupportedError } from '#internal/lib/errors.js';
import { allocate, camelCase, Names, pascalCase } from './names.js';

/**
 * What {@link generate} returns.
 */
export interface Generated {
    /**
     * The TypeScript source: a module importing `x` from `xenever`, unformatted.
     */
    readonly text: string;
}

/**
 * Builder of each built-in type in the `x` namespace.
 */
const builders: Readonly<Record<AtomicKind, string>> = {
    anyURI: 'anyUri',
    base64Binary: 'base64Binary',
    boolean: 'boolean',
    byte: 'byte',
    date: 'date',
    dateTime: 'dateTime',
    decimal: 'decimal',
    double: 'double',
    duration: 'duration',
    ENTITY: 'entity',
    float: 'float',
    gDay: 'gDay',
    gMonth: 'gMonth',
    gMonthDay: 'gMonthDay',
    gYear: 'gYear',
    gYearMonth: 'gYearMonth',
    hexBinary: 'hexBinary',
    ID: 'id',
    IDREF: 'idref',
    int: 'int',
    integer: 'integer',
    language: 'language',
    long: 'long',
    Name: 'name',
    NCName: 'ncName',
    negativeInteger: 'negativeInteger',
    NMTOKEN: 'nmtoken',
    nonNegativeInteger: 'nonNegativeInteger',
    nonPositiveInteger: 'nonPositiveInteger',
    normalizedString: 'normalizedString',
    positiveInteger: 'positiveInteger',
    QName: 'qname',
    short: 'short',
    string: 'string',
    time: 'time',
    token: 'token',
    unsignedByte: 'unsignedByte',
    unsignedInt: 'unsignedInt',
    unsignedLong: 'unsignedLong',
    unsignedShort: 'unsignedShort',
};

/**
 * TypeScript type of each built-in type's value, without enumeration (as `BaseValue` in `infer.ts`).
 */
const baseValues: Readonly<Record<AtomicKind, string>> = {
    ...(Object.fromEntries(Object.keys(builders).map(kind => [kind, 'string'])) as Record<
        AtomicKind,
        string
    >),
    boolean: 'boolean',
    byte: 'number',
    double: 'number',
    float: 'number',
    int: 'number',
    integer: 'number',
    long: 'number',
    negativeInteger: 'number',
    nonNegativeInteger: 'number',
    nonPositiveInteger: 'number',
    positiveInteger: 'number',
    QName: 'x.QNameValue',
    short: 'number',
    unsignedByte: 'number',
    unsignedInt: 'number',
    unsignedLong: 'number',
    unsignedShort: 'number',
};

/**
 * Most times a key occurs in keyed children: once, or more than once (an array).
 */
type Count = 1 | 2;

/**
 * Keys present in one possible shape of keyed children, each `true` when always present.
 */
type Shape = ReadonlyMap<string, boolean>;

/**
 * A particle that stands for one element: an element declaration, a lazy reference or a wildcard.
 */
type ElementParticle = Exclude<Particle, ModelGroup>;

/**
 * Identifiers of a JavaScript property name that needs no quotes.
 */
const plainProperty = /^[\p{ID_Start}$_][\p{ID_Continue}$]*$/v;

/**
 * A property name as written in source.
 *
 * @param key - name of the property, as in the value
 * @returns it bare when it is an identifier, quoted otherwise
 */
const property = (key: string): string => (plainProperty.test(key) ? key : JSON.stringify(key));

/**
 * A number as a JavaScript expression: `NaN`, the infinities and `-0` have no plain literal.
 *
 * @param value - a facet value
 * @returns the expression
 */
const numberLiteral = (value: number): string => {
    if (Number.isNaN(value)) {
        return 'Number.NaN';
    }
    if (!Number.isFinite(value)) {
        return value > 0 ? 'Number.POSITIVE_INFINITY' : 'Number.NEGATIVE_INFINITY';
    }
    return Object.is(value, -0) ? '-0' : String(value);
};

/**
 * A value of the IR (a facet, an option) as a JavaScript expression.
 *
 * @param value - plain data: a string, number, boolean, array or object
 * @returns the expression
 */
const literal = (value: unknown): string => {
    if (typeof value === 'number') {
        return numberLiteral(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(item => literal(item)).join(', ')}]`;
    }
    if (typeof value === 'object' && value !== null) {
        const entries = Object.entries(value).map(
            ([key, item]) => `${property(key)}: ${literal(item)}`
        );
        return `{ ${entries.join(', ')} }`;
    }
    return JSON.stringify(value);
};

/**
 * The options object a builder takes after its other arguments: the properties of an IR value they don't
 * cover, in the order the IR has them.
 *
 * @param record - an IR value
 * @param omit - properties the builder takes as arguments
 * @returns `{ ... }`, or `null` when no properties are left
 */
const optionsOf = (record: object, omit: readonly string[]): string | null => {
    const rest = Object.entries(record).filter(([key]) => !omit.includes(key));
    return rest.length === 0 ? null : literal(Object.fromEntries(rest));
};

/**
 * A builder call.
 *
 * @param builder - which of the `x` builders
 * @param args - its arguments, `null` for an options object left out
 * @returns `x.builder(...)`
 */
const call = (builder: string, args: readonly (string | null)[]): string =>
    `x.${builder}(${args.filter(arg => arg !== null).join(', ')})`;

/**
 * Code building an identity constraint.
 *
 * @param constraint - an identity constraint of an element declaration
 * @returns `x.key(...)`, `x.unique(...)` or `x.keyref(...)`
 */
const identityCode = (constraint: IdentityConstraint): string =>
    call(constraint.kind, [
        JSON.stringify(constraint.name),
        constraint.kind === 'keyref' ? literal(constraint.refer) : null,
        JSON.stringify(constraint.selector),
        literal(constraint.fields),
        optionsOf(constraint, ['kind', 'name', 'refer', 'selector', 'fields']),
    ]);

/**
 * The options object of an element builder, in the order the IR has them, its identity constraints built by
 * their builders.
 *
 * @param element - an element declaration
 * @returns `{ ... }`, or `null` when it has no options
 */
const elementOptions = (element: Element): string | null => {
    const entries = Object.entries(element)
        .filter(([key]) => !['kind', 'name', 'type'].includes(key))
        .map(
            ([key, value]) =>
                `${property(key)}: ${
                    key === 'identity'
                        ? `[${(value as readonly IdentityConstraint[]).map(constraint => identityCode(constraint)).join(', ')}]`
                        : literal(value)
                }`
        );
    return entries.length === 0 ? null : `{ ${entries.join(', ')} }`;
};

/**
 * A union of TypeScript types, each once.
 *
 * @param types - the members
 * @returns the union, `never` when empty
 */
const unionOf = (types: readonly string[]): string => {
    const distinct = [...new Set(types)];
    return distinct.length === 0 ? 'never' : distinct.join(' | ');
};

/**
 * An array of a TypeScript type, wrapped in parentheses when it is a union or intersection.
 *
 * @param type - type of the items
 * @returns the array type
 */
const arrayOf = (type: string): string =>
    type.includes('|') || type.includes('&') ? `(${type})[]` : `${type}[]`;

/**
 * An object type.
 *
 * @param members - its members, as `key: type` or `key?: type`
 * @returns the type, `x.NoProperties` when it has none
 */
const objectOf = (members: readonly string[]): string =>
    members.length === 0 ? 'x.NoProperties' : `{ ${members.join('; ')} }`;

/**
 * Whether a particle may occur more than once (`IsMany` in `infer.ts`).
 *
 * @param particle - an element, wildcard or model group
 * @returns whether its `maxOccurs` is above 1
 */
const isMany = (particle: Particle): boolean =>
    particle.maxOccurs !== undefined && particle.maxOccurs !== 0 && particle.maxOccurs !== 1;

/**
 * Whether a particle may be absent (`IsOptional` in `infer.ts`).
 *
 * @param particle - an element, wildcard or model group
 * @returns whether its `minOccurs` is 0
 */
const isOptional = (particle: Particle): boolean => particle.minOccurs === 0;

/**
 * Whether a particle is a model group.
 *
 * @param particle - an element, wildcard or model group
 * @returns whether it is a sequence, choice or all group
 */
const isGroup = (particle: Particle): particle is ModelGroup =>
    particle.kind === 'sequence' || particle.kind === 'choice' || particle.kind === 'all';

/**
 * Each combination of two lists of shapes, merged: a key is always present when it is in either.
 *
 * @param left - shapes of one particle
 * @param right - shapes of another
 * @returns the combined shapes
 */
const product = (left: readonly Shape[], right: readonly Shape[]): Shape[] =>
    left.flatMap(a =>
        right.map(b => {
            const merged = new Map(a);
            for (const [key, isRequired] of b) {
                merged.set(key, isRequired || merged.get(key) === true);
            }
            return merged;
        })
    );

/**
 * Key of a particle that stands for one element (`ParticleKey` in `infer.ts`).
 *
 * @param particle - an element, lazy reference or wildcard
 * @returns its key in children
 */
const particleKey = (particle: ElementParticle): string => {
    if (particle.kind === 'any') {
        return '#any';
    }
    const element = particle.kind === 'lazy' ? particle.get() : particle;
    return element.key ?? element.name;
};

/**
 * Most times each key occurs in a content model (`Counts` in `infer.ts`, `counts` in `content.ts`): in a choice
 * the larger count of its branches, elsewhere more than once for a key in two particles, and always more than
 * once in a group that repeats.
 *
 * @param particle - an element, wildcard or model group
 * @returns the count of each key
 */
const countsOf = (particle: Particle): Map<string, Count> => {
    if (!isGroup(particle)) {
        return new Map([
            [particleKey(particle), particle.kind === 'any' || isMany(particle) ? 2 : 1],
        ]);
    }
    const counts = new Map<string, Count>();
    for (const child of particle.particles) {
        for (const [key, count] of countsOf(child)) {
            const current = counts.get(key);
            let merged: Count = 2;
            if (current === undefined) {
                merged = count;
            } else if (particle.kind === 'choice') {
                merged = Math.max(current, count) as Count;
            }
            counts.set(key, merged);
        }
    }
    if (isMany(particle)) {
        for (const key of counts.keys()) {
            counts.set(key, 2);
        }
    }
    return counts;
};

/**
 * Possible shapes of keyed children (`Shapes` in `infer.ts`): a choice is one shape per branch, unless it
 * repeats (itself or through a group around it), when every key is optional.
 *
 * @param particle - an element, wildcard or model group
 * @param isInOptional - whether a group around it may be absent
 * @param isInRepeated - whether a group around it repeats
 * @returns one map of keys per possible shape
 */
const shapesOf = (particle: Particle, isInOptional: boolean, isInRepeated: boolean): Shape[] => {
    if (!isGroup(particle)) {
        return [new Map([[particleKey(particle), !isInOptional && !isOptional(particle)]])];
    }
    const isAbsentable = isInOptional || isOptional(particle);
    const isRepeated = isInRepeated || isMany(particle);
    if (!isRepeated && particle.kind === 'choice') {
        return particle.particles.flatMap(child => shapesOf(child, isAbsentable, false));
    }
    const isAllOptional = particle.kind === 'choice' || isAbsentable;
    let shapes: Shape[] = [new Map()];
    for (const child of particle.particles) {
        shapes = product(shapes, shapesOf(child, isAllOptional, isRepeated));
    }
    return shapes;
};

/**
 * Name of a component in Clark notation, as the `ordered` option takes it.
 *
 * @param namespace - its namespace, if any
 * @param name - its local name
 * @returns `{namespace}name`, or `name`
 */
const clark = (namespace: string | undefined, name: string): string =>
    namespace === undefined ? name : `{${namespace}}${name}`;

/**
 * A doc comment.
 *
 * @param text - what it says, on one line
 * @returns the text in a JSDoc block
 */
const docComment = (text: string): string => `/**\n * ${text}\n */`;

/**
 * Literal type of an enumeration value.
 *
 * @param value - the value, as the IR writes it
 * @param isBigint - whether the type's values are `bigint`, whose enumeration values the IR writes as strings
 * @returns the literal type
 */
const enumerationLiteral = (value: number | string, isBigint: boolean): string => {
    if (isBigint) {
        return `${value}n`;
    }
    return typeof value === 'number' ? String(value) : JSON.stringify(value);
};

/**
 * Date, time and duration types, which match their enumeration by value, so it doesn't narrow their type.
 */
const dateKinds: ReadonlySet<string> = new Set<DateKind>([
    'date',
    'dateTime',
    'duration',
    'gDay',
    'gMonth',
    'gMonthDay',
    'gYear',
    'gYearMonth',
    'time',
]);

/**
 * TypeScript type of a built-in type's value: a literal union when enumerated, except dates
 * (`AtomicValue` in `infer.ts`). An enumerated `INF`, `-INF` or `NaN` has no literal type, so makes it
 * `number`.
 *
 * @param type - a built-in type with its facets
 * @returns the TypeScript type
 */
const atomicValue = (type: AtomicType): string => {
    const isBigint = 'bigint' in type && type.bigint;
    const enumeration = (
        type.facets as { readonly enumeration?: readonly (number | string)[] } | undefined
    )?.enumeration;
    if (enumeration === undefined || dateKinds.has(type.kind)) {
        return isBigint ? 'bigint' : baseValues[type.kind];
    }
    if (enumeration.some(value => typeof value === 'number' && !Number.isFinite(value))) {
        return 'number';
    }
    return unionOf(enumeration.map(value => enumerationLiteral(value, isBigint)));
};

/**
 * The options object of a wildcard builder, in the order the IR has them, its `declarations` getter as an arrow
 * function returning them. The loader always writes `processContents`, so there is one.
 *
 * @param wildcard - an `xs:any` or `xs:anyAttribute` in the IR
 * @param declarations - the getter of the global declarations it validates against, if any
 * @param code - prints one of its declarations, building it or naming its const
 * @returns the object literal, `{ ... }`
 */
const wildcardOptions = <Declaration>(
    wildcard: Any | AnyAttribute,
    declarations: (() => readonly Declaration[]) | undefined,
    code: (declaration: Declaration) => string
): string => {
    const fields = Object.entries(wildcard)
        .filter(([key]) => key !== 'kind')
        .map(([key, value]) =>
            key === 'declarations'
                ? `declarations: () => [${declarations!()
                      .map(declaration => code(declaration))
                      .join(', ')}]`
                : `${property(key)}: ${literal(value)}`
        );
    return `{ ${fields.join(', ')} }`;
};

/**
 * Code building a built-in type.
 *
 * @param type - a built-in type with its facets
 * @returns the builder call
 */
const atomicCode = (type: AtomicType): string => {
    const facets = type.facets ?? {};
    const argument = 'bigint' in type && type.bigint ? { bigint: true, ...facets } : facets;
    return call(builders[type.kind], [
        Object.keys(argument).length === 0 ? null : literal(argument),
    ]);
};

/**
 * Types a type's const uses directly: the types of its attributes, text, list items, union members and
 * elements, but not those behind lazy references.
 *
 * @param type - a simple or complex type
 * @returns the types it uses
 */
const usedTypes = (type: Type): Type[] => {
    if (type.kind === 'list') {
        return [type.item];
    }
    if (type.kind === 'union') {
        return [...type.members];
    }
    if (type.kind !== 'complex') {
        return [];
    }
    const particleTypes = (particle: Particle): Type[] => {
        if (isGroup(particle)) {
            return particle.particles.flatMap(child => particleTypes(child));
        }
        return particle.kind === 'element' ? [particle.type] : [];
    };
    return [
        ...(type.attributes ?? []).flatMap(attribute =>
            attribute.kind === 'attribute' ? [attribute.type] : []
        ),
        ...(type.text ? [type.text] : []),
        ...(type.content ? particleTypes(type.content) : []),
    ];
};

/**
 * Prints a schema set as TypeScript: types and consts in topological order, then elements in document order.
 */
class Printer {
    readonly #set: XsdSchemaSet;
    /**
     * Identifier of each named type, for both its TypeScript type and its const.
     */
    readonly #typeNames = new Map<Type, string>();
    /**
     * Identifiers of each global element: its const, and the TypeScript type of its value.
     */
    readonly #elementNames = new Map<Element, { readonly value: string; readonly type: string }>();
    /**
     * Anonymous complex types being printed, to find one that contains itself.
     */
    readonly #printing = new Set<ComplexType>();

    /**
     * @param set - global elements and named types to print
     */
    public constructor(set: XsdSchemaSet) {
        this.#set = set;
        const values = new Names('value');
        const types = new Names('type');
        for (const { name, type } of set.types) {
            this.#typeNames.set(type, allocate(pascalCase(name), [values, types]));
        }
        for (const element of set.elements) {
            this.#elementNames.set(element, {
                value: allocate(camelCase(element.name), [values]),
                type: allocate(pascalCase(element.name), [types]),
            });
        }
    }

    /**
     * Prints the module.
     *
     * @returns its source
     */
    public print(): string {
        const declarations: string[] = [];
        for (const { name, namespace, type } of this.#ordered()) {
            const identifier = this.#typeNames.get(type)!;
            const declaration =
                type.kind === 'complex'
                    ? `export interface ${identifier} ${this.#complexValue(type)}`
                    : `export type ${identifier} = ${this.#simpleValue(type)};`;
            declarations.push(
                [
                    docComment(`The type \`${clark(namespace, name)}\`.`),
                    declaration,
                    `export const ${identifier} = ${this.#typeCode(type, false)};`,
                ].join('\n')
            );
        }
        for (const element of this.#set.elements) {
            const { value, type } = this.#elementNames.get(element)!;
            const annotation = `x.ElementSchema<${JSON.stringify(element.name)}, ${type}>`;
            declarations.push(
                [
                    docComment(`The element \`${clark(element.namespace, element.name)}\`.`),
                    `export type ${type} = ${this.#elementValue(element)};`,
                    `export const ${value}: ${annotation} = ${this.#elementCode(element)};`,
                ].join('\n')
            );
        }
        return `import { x } from 'xenever';\n\n${declarations.join('\n\n')}\n`;
    }

    /**
     * Named types, each after the named types its const uses, as a const can't be read before it is declared.
     * Lazy references are read later, so don't count. Otherwise in document order.
     *
     * @returns the named types
     */
    #ordered(): XsdSchemaSet['types'] {
        const byType = new Map(this.#set.types.map(named => [named.type, named]));
        const ordered: XsdSchemaSet['types'][number][] = [];
        const visited = new Set<Type>();
        const visit = (type: Type): void => {
            if (visited.has(type)) {
                return;
            }
            visited.add(type);
            for (const used of usedTypes(type)) {
                visit(used);
            }
            const named = byType.get(type);
            if (named) {
                ordered.push(named);
            }
        };
        for (const { type } of this.#set.types) {
            visit(type);
        }
        return ordered;
    }

    /**
     * Code building a type: its builder, or the const of a named type used inside another.
     *
     * @param type - a simple or complex type
     * @param isReference - whether it is used inside another, where a named type is its const
     * @returns the expression
     */
    #typeCode(type: Type, isReference: boolean): string {
        const named = this.#typeNames.get(type);
        if (isReference && named !== undefined) {
            return named;
        }
        if (type.kind === 'complex') {
            return this.#guard(type, () => this.#complexCode(type));
        }
        if (type.kind === 'list') {
            return call('list', [
                this.#typeCode(type.item, true),
                type.facets ? literal(type.facets) : null,
            ]);
        }
        if (type.kind === 'union') {
            const members = type.members.map(member => this.#typeCode(member, true));
            return call('union', [
                `[${members.join(', ')}]`,
                type.facets ? literal(type.facets) : null,
            ]);
        }
        return atomicCode(type);
    }

    /**
     * Code building a complex type, its properties in the order the IR has them.
     *
     * @param type - a complex type
     * @returns the builder call
     */
    #complexCode(type: ComplexType): string {
        const fields = Object.entries(type)
            .filter(([key]) => key !== 'kind')
            .map(([key, value]): string => {
                if (key === 'attributes') {
                    const attributes = (value as NonNullable<ComplexType['attributes']>).map(
                        attribute => this.#attributeCode(attribute)
                    );
                    return `attributes: [${attributes.join(', ')}]`;
                }
                if (key === 'content') {
                    return `content: ${this.#particleCode(value as ModelGroup)}`;
                }
                if (key === 'text') {
                    return `text: ${this.#typeCode(value as SimpleType, true)}`;
                }
                return `${key}: ${literal(value)}`;
            });
        return call('complex', [fields.length === 0 ? null : `{ ${fields.join(', ')} }`]);
    }

    /**
     * Code building an attribute declaration or wildcard.
     *
     * @param attribute - an attribute declaration or wildcard
     * @returns the builder call
     */
    #attributeCode(attribute: AnyAttribute | Attribute): string {
        if (attribute.kind === 'anyAttribute') {
            return call('anyAttribute', [
                wildcardOptions(attribute, attribute.declarations, declaration =>
                    this.#attributeCode(declaration)
                ),
            ]);
        }
        return call('attribute', [
            JSON.stringify(attribute.name),
            this.#typeCode(attribute.type, true),
            optionsOf(attribute, ['kind', 'name', 'type']),
        ]);
    }

    /**
     * Code building a particle. A lazy reference's getter returns the const of a global element, or a declaration
     * built where it is (which `parse` reads once).
     *
     * @param particle - an element, lazy reference, wildcard or model group
     * @returns the builder call
     */
    #particleCode(particle: Particle): string {
        if (particle.kind === 'element') {
            return this.#elementCode(particle);
        }
        if (particle.kind === 'lazy') {
            const target = particle.get();
            const [key, value] = this.#entry(particle);
            const getter = `(): x.ElementOf<${JSON.stringify(key)}, ${value}> => ${this.#elementNames.get(target)?.value ?? this.#elementCode(target)}`;
            return call('lazy', [getter, optionsOf(particle, ['kind', 'get'])]);
        }
        if (particle.kind === 'any') {
            return call('any', [
                wildcardOptions(
                    particle,
                    particle.declarations,
                    // The loader's wildcards validate against global elements, each a const.
                    declaration => this.#elementNames.get(declaration)!.value
                ),
            ]);
        }
        const particles = particle.particles.map(child => this.#particleCode(child));
        return call(particle.kind, [
            `[${particles.join(', ')}]`,
            optionsOf(particle, ['kind', 'particles']),
        ]);
    }

    /**
     * Code building an element declaration.
     *
     * @param element - a global or local element declaration
     * @returns the builder call
     */
    #elementCode(element: Element): string {
        return call('element', [
            JSON.stringify(element.name),
            this.#typeCode(element.type, true),
            elementOptions(element),
        ]);
    }

    /**
     * Runs a printer of a complex type. An anonymous one must not contain itself: its TypeScript type would have
     * no name to refer to.
     *
     * @param type - a complex type
     * @param print - prints it
     * @returns what the printer returns
     * @throws {XeneverUnsupportedError} when an anonymous type contains itself
     */
    #guard(type: ComplexType, print: () => string): string {
        if (this.#typeNames.has(type)) {
            return print();
        }
        if (this.#printing.has(type)) {
            throw new XeneverUnsupportedError(
                'An anonymous complex type that contains itself (through a named group) is not supported: name the type',
                { path: '/' }
            );
        }
        this.#printing.add(type);
        try {
            return print();
        } finally {
            this.#printing.delete(type);
        }
    }

    /**
     * TypeScript type of a type's value: the name of a named type, or the type printed.
     *
     * @param type - a simple or complex type
     * @returns the TypeScript type
     */
    #typeValue(type: Type): string {
        const named = this.#typeNames.get(type);
        if (named !== undefined) {
            return named;
        }
        return type.kind === 'complex'
            ? this.#guard(type, () => this.#complexValue(type))
            : this.#simpleValue(type);
    }

    /**
     * TypeScript type of an element's value (`ElementValue` in `infer.ts`): `null` too when it is nillable, and
     * `never` when it is abstract.
     *
     * @param element - a global or local element declaration
     * @returns the TypeScript type
     */
    #elementValue(element: Element): string {
        if (element.abstract === true) {
            return 'never';
        }
        const value = this.#typeValue(element.type);
        return element.nillable === true ? `${value} | null` : value;
    }

    /**
     * TypeScript type of a simple type's value (`SimpleValue` in `infer.ts`).
     *
     * @param type - an atomic, list or union type
     * @returns the TypeScript type
     */
    #simpleValue(type: SimpleType): string {
        if (type.kind === 'list') {
            return arrayOf(this.#typeValue(type.item));
        }
        if (type.kind === 'union') {
            return unionOf(type.members.map(member => this.#typeValue(member)));
        }
        return atomicValue(type);
    }

    /**
     * TypeScript type of a complex type's value (`ComplexValue` in `infer.ts`).
     *
     * @param type - a complex type
     * @returns the object type
     */
    #complexValue(type: ComplexType): string {
        const members = [`attributes: ${this.#attributesValue(type.attributes ?? [])}`];
        if (type.content) {
            const isMixed = type.mixed === true;
            const children =
                isMixed || type.ordered === true
                    ? this.#orderedValue(type.content, isMixed)
                    : this.#keyedValue(type.content);
            members.push(`children: ${children}`);
        } else if (type.text) {
            members.push(`text: ${this.#typeValue(type.text)}`);
        }
        return objectOf(members);
    }

    /**
     * TypeScript type of a complex type's `attributes` (`AttributesValue` in `infer.ts`).
     *
     * @param attributes - attribute declarations and wildcard
     * @returns the object type
     */
    #attributesValue(attributes: readonly (AnyAttribute | Attribute)[]): string {
        return objectOf(
            attributes.map(attribute => {
                if (attribute.kind === 'anyAttribute') {
                    return "'#any'?: x.XmlAttribute[]";
                }
                const isRequired =
                    attribute.use === 'required' ||
                    attribute.default !== undefined ||
                    attribute.fixed !== undefined;
                return `${property(attribute.key ?? attribute.name)}${isRequired ? '' : '?'}: ${this.#typeValue(attribute.type)}`;
            })
        );
    }

    /**
     * TypeScript type of each key's value in a content model, once per occurrence (`Values` in `infer.ts`).
     * Element Declarations Consistent, which compiling the schema checks, makes every element of one key alike,
     * so the first one gives the value.
     *
     * @param particle - an element, wildcard or model group
     * @param values - types by key, added to
     * @returns the types by key, in declaration order
     */
    #values(particle: Particle, values = new Map<string, string>()): Map<string, string> {
        if (isGroup(particle)) {
            for (const child of particle.particles) {
                this.#values(child, values);
            }
            return values;
        }
        const [key, value] = this.#entry(particle);
        if (!values.has(key)) {
            values.set(key, value);
        }
        return values;
    }

    /**
     * Key and value type of a particle that stands for one element.
     *
     * @param particle - an element, lazy reference or wildcard
     * @returns its key in children and the TypeScript type of one occurrence
     */
    #entry(particle: ElementParticle): readonly [key: string, value: string] {
        if (particle.kind === 'any') {
            return ['#any', 'x.XmlNode'];
        }
        const element = particle.kind === 'lazy' ? particle.get() : particle;
        // A lazy reference to a global element names its type: printing it could loop back to the reference.
        const global = particle.kind === 'lazy' ? this.#elementNames.get(element) : undefined;
        return [particleKey(particle), global?.type ?? this.#elementValue(element)];
    }

    /**
     * TypeScript type of keyed children (`ChildrenValue` in `infer.ts`): a union of one object per shape, where
     * keys of other shapes are `?: never`.
     *
     * @param group - the content model
     * @returns the TypeScript type
     */
    #keyedValue(group: ModelGroup): string {
        const values = this.#values(group);
        const counts = countsOf(group);
        const objects = shapesOf(group, false, false).map(shape =>
            objectOf(
                [...values].map(([key, value]) => {
                    const isRequired = shape.get(key);
                    if (isRequired === undefined) {
                        return `${property(key)}?: never`;
                    }
                    const typed = counts.get(key) === 2 ? arrayOf(value) : value;
                    return `${property(key)}${isRequired ? '' : '?'}: ${typed}`;
                })
            )
        );
        return unionOf(objects);
    }

    /**
     * TypeScript type of ordered children (`OrderedChildrenValue` in `infer.ts`).
     *
     * @param group - the content model
     * @param isMixed - whether text entries come between elements
     * @returns the TypeScript type
     */
    #orderedValue(group: ModelGroup, isMixed: boolean): string {
        const entries = [...this.#values(group)].map(
            ([key, value]) => `{ name: ${JSON.stringify(key)}; value: ${value} }`
        );
        return arrayOf(
            unionOf(isMixed ? ["{ name: '#text'; value: string }", ...entries] : entries)
        );
    }
}

/**
 * Generates TypeScript from a schema set: for each named type, a TypeScript type of its value and a const of
 * the same name building it with the `x` builders, and for each global element, a const ready for `parse`,
 * annotated with the type of its value. Printing the types, rather than leaving them to `x.Infer`, keeps large
 * schemas fast to type-check, and lets recursive ones type-check at all.
 *
 * The same schema set always generates the same text. Identifiers come from the XSD names: types PascalCase,
 * element consts camelCase, with `_2`, `_3`... added in document order when two would collide, or one is a
 * reserved word.
 *
 * @param set - global elements and named types, as `loadXsd` returns them
 * @returns the TypeScript source, unformatted
 * @throws {XeneverUnsupportedError} when an anonymous complex type contains itself, which only a name could
 * refer to
 */
export const generate = (set: XsdSchemaSet): Generated => {
    const printer = new Printer(set);
    return { text: printer.print() };
};

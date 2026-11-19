import type { StandardSchemaV1 } from '#internal/lib/standard-schema.js';
import type { Infer, NoProperties } from './infer.js';
import type {
    Any,
    AnyAttribute,
    AtomicType,
    Attribute,
    BigIntegerKind,
    BigIntFacets,
    BinaryKind,
    ComplexType,
    DateFacets,
    DateKind,
    DecimalFacets,
    Element,
    ElementOf,
    FloatFacets,
    FloatKind,
    IdentityConstraintBase,
    IdentityName,
    IntFacets,
    IntKind,
    LengthFacets,
    ListFacets,
    ModelGroup,
    Occurs,
    Particle,
    PatternFacet,
    SimpleType,
    StringFacets,
    StringKind,
    Type,
    UnionType,
} from './ir.js';
import { standardProps } from '#internal/lib/parse.js';

/**
 * A built-in type with its facets, as a builder returns it.
 *
 * @template Kind - built-in type
 * @template Facets - facets given
 */
export type Atomic<Kind extends string, Facets> = [Facets] extends [never]
    ? { readonly kind: Kind }
    : { readonly kind: Kind; readonly facets: Facets };

/**
 * Builds a built-in type, leaving `facets` out when none are given.
 *
 * @param kind - built-in type
 * @param facets - facets restricting it
 * @returns the type
 */
const atomic = <Kind extends string, Facets>(
    kind: Kind,
    facets: Facets | undefined
): Atomic<Kind, Facets> =>
    (facets === undefined ? { kind } : { kind, facets }) as Atomic<Kind, Facets>;

/**
 * A builder of a string type.
 *
 * @template Kind - built-in type
 */
type StringBuilder<Kind extends StringKind> = <const F extends StringFacets = never>(
    facets?: F
) => Atomic<Kind, NoInfer<F>>;

/**
 * Builder of a string type.
 *
 * @param kind - built-in type
 * @returns its builder
 */
const stringBuilder =
    <Kind extends StringKind>(kind: Kind): StringBuilder<Kind> =>
    facets =>
        atomic(kind, facets);

/**
 * `xs:string`: any text, whitespace kept as written.
 */
export const string: StringBuilder<'string'> = stringBuilder('string');
/**
 * `xs:normalizedString`: tabs and line breaks become spaces.
 */
export const normalizedString: StringBuilder<'normalizedString'> =
    stringBuilder('normalizedString');
/**
 * `xs:token`: whitespace collapsed (runs become one space, none at either end).
 */
export const token: StringBuilder<'token'> = stringBuilder('token');
/**
 * `xs:language`: a language tag such as `en-US`.
 */
export const language: StringBuilder<'language'> = stringBuilder('language');
/**
 * `xs:NMTOKEN`: one or more XML name characters.
 */
export const nmtoken: StringBuilder<'NMTOKEN'> = stringBuilder('NMTOKEN');
/**
 * `xs:Name`: an XML name.
 */
export const name: StringBuilder<'Name'> = stringBuilder('Name');
/**
 * `xs:NCName`: an XML name without a colon.
 */
export const ncName: StringBuilder<'NCName'> = stringBuilder('NCName');
/**
 * `xs:ID`: an NCName, which no other element in the document may have as its ID.
 */
export const id: StringBuilder<'ID'> = stringBuilder('ID');
/**
 * `xs:IDREF`: an NCName, which must be the `ID` of an element in the document.
 */
export const idref: StringBuilder<'IDREF'> = stringBuilder('IDREF');
/**
 * `xs:ENTITY`: an NCName. Never resolved, as xenever accepts no DTD.
 */
export const entity: StringBuilder<'ENTITY'> = stringBuilder('ENTITY');
/**
 * `xs:anyURI`: any text, whitespace collapsed ([XSD 1.1 Part 2 §3.3.17](https://www.w3.org/TR/xmlschema11-2/#anyURI)).
 */
export const anyUri: StringBuilder<'anyURI'> = stringBuilder('anyURI');

/**
 * A builder of an integer type whose value is a `number`.
 *
 * @template Kind - built-in type
 */
type IntBuilder<Kind extends IntKind> = <const F extends IntFacets = never>(
    facets?: F
) => Atomic<Kind, NoInfer<F>>;

/**
 * Builder of an integer type whose value is a `number`.
 *
 * @param kind - built-in type
 * @returns its builder
 */
const intBuilder =
    <Kind extends IntKind>(kind: Kind): IntBuilder<Kind> =>
    facets =>
        atomic(kind, facets);

/**
 * `xs:int`: a 32-bit signed integer.
 */
export const int: IntBuilder<'int'> = intBuilder('int');
/**
 * `xs:short`: a 16-bit signed integer.
 */
export const short: IntBuilder<'short'> = intBuilder('short');
/**
 * `xs:byte`: an 8-bit signed integer.
 */
export const byte: IntBuilder<'byte'> = intBuilder('byte');
/**
 * `xs:unsignedInt`: a 32-bit unsigned integer.
 */
export const unsignedInt: IntBuilder<'unsignedInt'> = intBuilder('unsignedInt');
/**
 * `xs:unsignedShort`: a 16-bit unsigned integer.
 */
export const unsignedShort: IntBuilder<'unsignedShort'> = intBuilder('unsignedShort');
/**
 * `xs:unsignedByte`: an 8-bit unsigned integer.
 */
export const unsignedByte: IntBuilder<'unsignedByte'> = intBuilder('unsignedByte');

/**
 * Options of an integer type that may exceed the safe range: facets, and `bigint: true` for a `bigint` value.
 */
export type BigIntegerOptions =
    | (BigIntFacets & { readonly bigint: true })
    | (IntFacets & { readonly bigint?: false });

/**
 * A big integer type as a builder returns it.
 *
 * @template Kind - built-in type
 * @template O - options given
 */
export type BigInteger<Kind extends BigIntegerKind, O> = {
    readonly kind: Kind;
} & ([Exclude<keyof O, 'bigint'>] extends [never]
    ? NoProperties
    : { readonly facets: Omit<O, 'bigint'> }) &
    ([O] extends [never]
        ? NoProperties
        : O extends { readonly bigint: true }
          ? { readonly bigint: true }
          : NoProperties);

/**
 * A builder of an integer type that may exceed the safe range.
 *
 * @template Kind - built-in type
 */
type BigIntegerBuilder<Kind extends BigIntegerKind> = <const O extends BigIntegerOptions = never>(
    options?: O
) => BigInteger<Kind, NoInfer<O>>;

/**
 * Builder of an integer type that may exceed the safe range.
 *
 * @param kind - built-in type
 * @returns its builder
 */
const bigIntegerBuilder =
    <Kind extends BigIntegerKind>(kind: Kind): BigIntegerBuilder<Kind> =>
    <const O extends BigIntegerOptions = never>(options?: O): BigInteger<Kind, O> => {
        if (options === undefined) {
            return { kind } as BigInteger<Kind, O>;
        }
        const { bigint, ...facets } = options;
        const facetsPart = Object.keys(facets).length === 0 ? {} : { facets };
        return (
            bigint === true ? { kind, bigint, ...facetsPart } : { kind, ...facetsPart }
        ) as BigInteger<Kind, O>;
    };

/**
 * `xs:integer`: any integer. A `number` (outside the safe range is an error) unless `bigint: true`.
 */
export const integer: BigIntegerBuilder<'integer'> = bigIntegerBuilder('integer');
/**
 * `xs:long`: a 64-bit signed integer. A `number` (outside the safe range is an error) unless `bigint: true`.
 */
export const long: BigIntegerBuilder<'long'> = bigIntegerBuilder('long');
/**
 * `xs:unsignedLong`: a 64-bit unsigned integer. A `number` (outside the safe range is an error) unless
 * `bigint: true`.
 */
export const unsignedLong: BigIntegerBuilder<'unsignedLong'> = bigIntegerBuilder('unsignedLong');
/**
 * `xs:positiveInteger`: an integer above 0. A `number` (outside the safe range is an error) unless
 * `bigint: true`.
 */
export const positiveInteger: BigIntegerBuilder<'positiveInteger'> =
    bigIntegerBuilder('positiveInteger');
/**
 * `xs:nonNegativeInteger`: an integer of at least 0. A `number` (outside the safe range is an error) unless
 * `bigint: true`.
 */
export const nonNegativeInteger: BigIntegerBuilder<'nonNegativeInteger'> =
    bigIntegerBuilder('nonNegativeInteger');
/**
 * `xs:negativeInteger`: an integer below 0. A `number` (outside the safe range is an error) unless
 * `bigint: true`.
 */
export const negativeInteger: BigIntegerBuilder<'negativeInteger'> =
    bigIntegerBuilder('negativeInteger');
/**
 * `xs:nonPositiveInteger`: an integer of at most 0. A `number` (outside the safe range is an error) unless
 * `bigint: true`.
 */
export const nonPositiveInteger: BigIntegerBuilder<'nonPositiveInteger'> =
    bigIntegerBuilder('nonPositiveInteger');

/**
 * `xs:decimal`: a decimal number, as a string in canonical form so it stays exact (`+01.50` is `'1.5'`,
 * `3.0` is `'3'`).
 *
 * @param facets - facets restricting it
 * @returns the type
 */
export const decimal = <const F extends DecimalFacets = never>(
    facets?: F
): Atomic<'decimal', NoInfer<F>> => atomic('decimal', facets);

/**
 * A builder of a floating point type.
 *
 * @template Kind - built-in type
 */
type FloatBuilder<Kind extends FloatKind> = <const F extends FloatFacets = never>(
    facets?: F
) => Atomic<Kind, NoInfer<F>>;

/**
 * `xs:float`: a 32-bit float, as the `number` closest to it. `INF`, `-INF` and `NaN` included.
 *
 * @param facets - facets restricting it
 * @returns the type
 */
export const float: FloatBuilder<'float'> = facets => atomic('float', facets);
/**
 * `xs:double`: a 64-bit float. `INF`, `-INF` and `NaN` included.
 *
 * @param facets - facets restricting it
 * @returns the type
 */
export const double: FloatBuilder<'double'> = facets => atomic('double', facets);

/**
 * `xs:boolean`: `true`, `false`, `1` or `0`.
 *
 * @param facets - facets restricting it
 * @returns the type
 */
export const boolean = <const F extends PatternFacet = never>(
    facets?: F
): Atomic<'boolean', NoInfer<F>> => atomic('boolean', facets);

/**
 * A builder of a date, time or duration type.
 *
 * @template Kind - built-in type
 */
type DateBuilder<Kind extends DateKind> = <const F extends DateFacets = never>(
    facets?: F
) => Atomic<Kind, NoInfer<F>>;

/**
 * Builder of a date, time or duration type.
 *
 * @param kind - built-in type
 * @returns its builder
 */
const dateBuilder =
    <Kind extends DateKind>(kind: Kind): DateBuilder<Kind> =>
    facets =>
        atomic(kind, facets);

/**
 * `xs:dateTime`, as written, e.g. `2026-11-12T09:30:00Z`.
 */
export const dateTime: DateBuilder<'dateTime'> = dateBuilder('dateTime');
/**
 * `xs:date`, as written, e.g. `2026-11-12`.
 */
export const date: DateBuilder<'date'> = dateBuilder('date');
/**
 * `xs:time`, as written, e.g. `09:30:00`.
 */
export const time: DateBuilder<'time'> = dateBuilder('time');
/**
 * `xs:gYear`, as written, e.g. `2026`.
 */
export const gYear: DateBuilder<'gYear'> = dateBuilder('gYear');
/**
 * `xs:gYearMonth`, as written, e.g. `2026-11`.
 */
export const gYearMonth: DateBuilder<'gYearMonth'> = dateBuilder('gYearMonth');
/**
 * `xs:gMonth`, as written, e.g. `--11`.
 */
export const gMonth: DateBuilder<'gMonth'> = dateBuilder('gMonth');
/**
 * `xs:gMonthDay`, as written, e.g. `--11-12`.
 */
export const gMonthDay: DateBuilder<'gMonthDay'> = dateBuilder('gMonthDay');
/**
 * `xs:gDay`, as written, e.g. `---12`.
 */
export const gDay: DateBuilder<'gDay'> = dateBuilder('gDay');
/**
 * `xs:duration`, as written, e.g. `P1Y2M3DT4H`.
 */
export const duration: DateBuilder<'duration'> = dateBuilder('duration');

/**
 * A builder of a binary type.
 *
 * @template Kind - built-in type
 */
type BinaryBuilder<Kind extends BinaryKind> = <const F extends LengthFacets & PatternFacet = never>(
    facets?: F
) => Atomic<Kind, NoInfer<F>>;

/**
 * `xs:base64Binary`, as written (whitespace collapsed).
 *
 * @param facets - facets restricting it
 * @returns the type
 */
export const base64Binary: BinaryBuilder<'base64Binary'> = facets => atomic('base64Binary', facets);
/**
 * `xs:hexBinary`, as written.
 *
 * @param facets - facets restricting it
 * @returns the type
 */
export const hexBinary: BinaryBuilder<'hexBinary'> = facets => atomic('hexBinary', facets);

/**
 * `xs:QName`: `{ namespace, localName }`, its prefix resolved against the namespaces in scope where it is
 * written (an unprefixed name takes the default namespace).
 *
 * @param facets - facets restricting it
 * @returns the type
 */
export const qname = <const F extends PatternFacet = never>(
    facets?: F
): Atomic<'QName', NoInfer<F>> => atomic('QName', facets);

/**
 * A list type as the builder returns it.
 *
 * @template Item - item type
 * @template Facets - facets given
 */
export type List<Item, Facets> = {
    readonly kind: 'list';
    readonly item: Item;
} & ([Facets] extends [never] ? NoProperties : { readonly facets: Facets });

/**
 * A whitespace-separated list: an array of the item type's values.
 *
 * @param item - type of each item: atomic or a union
 * @param facets - facets restricting the list; lengths count items, and enumeration values are lexical lists
 * @returns the type
 */
export const list = <const Item extends AtomicType | UnionType, const F extends ListFacets = never>(
    item: Item,
    facets?: F
): List<Item, NoInfer<F>> =>
    (facets === undefined ? { kind: 'list', item } : { kind: 'list', item, facets }) as List<
        Item,
        F
    >;

/**
 * A union type as the builder returns it.
 *
 * @template Members - member types
 * @template Facets - facets given
 */
export type Union<Members, Facets> = {
    readonly kind: 'union';
    readonly members: Members;
} & ([Facets] extends [never] ? NoProperties : { readonly facets: Facets });

/**
 * A union of simple types: the value of the first member that accepts the text.
 *
 * @param members - member types, tried in order
 * @param facets - facets restricting the union
 * @returns the type
 */
export const union = <
    const Members extends readonly SimpleType[],
    const F extends PatternFacet = never,
>(
    members: Members,
    facets?: F
): Union<Members, NoInfer<F>> =>
    (facets === undefined
        ? { kind: 'union', members }
        : { kind: 'union', members, facets }) as Union<Members, F>;

/**
 * Options of an element declaration.
 */
export type ElementOptions = Omit<Element, 'kind' | 'name' | 'type'>;

/**
 * An element declaration as the builder returns it: plain data, plus a non-enumerable Standard Schema
 * `'~standard'` that parses an XML string with this as its root.
 *
 * @template N - local name
 * @template T - type of the element
 * @template O - options given
 */
export type ElementBuilt<N extends string, T extends Type, O> = Simplify<
    O & { readonly kind: 'element'; readonly name: N; readonly type: T }
> &
    StandardSchemaV1<string, Infer<Simplify<O & { readonly kind: 'element'; readonly type: T }>>>;

/**
 * An element declaration with the key and value it has in `children` (as {@link ElementOf}) that also
 * implements Standard Schema, parsing an XML string with it as the root into `Value`. What the builder returns
 * is one, so the importer annotates each global element const with it.
 *
 * @template Key - key in `children`
 * @template Value - value in `children`, and output of `'~standard'`
 */
export type ElementSchema<Key extends string, Value> = ElementOf<Key, Value> &
    StandardSchemaV1<string, Value>;

/**
 * Flattens an intersection into one object type.
 *
 * @template T - intersection to flatten
 */
type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * An element declaration. Passed to `parse`, it is the root: its `minOccurs` and `maxOccurs` are then ignored.
 *
 * @param elementName - local name, an NCName
 * @param type - simple or complex type
 * @param options - namespace, occurrences and key
 * @returns the declaration, which also implements Standard Schema (`'~standard'`)
 */
export const element = <
    const N extends string,
    const T extends Type,
    const O extends ElementOptions = NoProperties,
>(
    elementName: N,
    type: T,
    options?: O
): ElementBuilt<N, T, NoInfer<O>> => {
    const declaration = { kind: 'element', name: elementName, type, ...options } as const;
    // Not enumerable, so the declaration still serializes (and compares) as plain data.
    Object.defineProperty(declaration, '~standard', { value: standardProps(declaration) });
    return declaration as unknown as ElementBuilt<N, T, NoInfer<O>>;
};

/**
 * Options of an attribute declaration.
 */
export type AttributeOptions = Omit<Attribute, 'kind' | 'name' | 'type'>;

/**
 * An attribute declaration.
 *
 * @param attributeName - local name, an NCName
 * @param type - simple type
 * @param options - namespace, use and key
 * @returns the declaration
 */
export const attribute = <
    const N extends string,
    const T extends SimpleType,
    const O extends AttributeOptions = NoProperties,
>(
    attributeName: N,
    type: T,
    options?: O
): Simplify<NoInfer<O> & { readonly kind: 'attribute'; readonly name: N; readonly type: T }> =>
    ({ kind: 'attribute', name: attributeName, type, ...options }) as Simplify<
        O & { readonly kind: 'attribute'; readonly name: N; readonly type: T }
    >;

/**
 * Options of a complex type.
 */
export type ComplexOptions = Omit<ComplexType, 'kind'>;

/**
 * A complex type: `attributes`, and child elements (`content`), text (`text`) or neither.
 *
 * @param options - attributes and content
 * @returns the type
 */
export const complex = <const O extends ComplexOptions = NoProperties>(
    options?: O
): Simplify<NoInfer<O> & { readonly kind: 'complex' }> =>
    ({ kind: 'complex', ...options }) as Simplify<O & { readonly kind: 'complex' }>;

/**
 * A model group as a builder returns it.
 *
 * @template Kind - built-in type
 * @template Ps - particles
 * @template O - options given
 */
export type Group<Kind extends ModelGroup['kind'], Ps, O> = Simplify<
    O & { readonly kind: Kind; readonly particles: Ps }
>;

/**
 * Elements in this order.
 *
 * @param particles - elements and groups
 * @param options - occurrences
 * @returns the group
 */
export const sequence = <
    const Ps extends readonly Particle[],
    const O extends Occurs = NoProperties,
>(
    particles: Ps,
    options?: O
): Group<'sequence', Ps, NoInfer<O>> =>
    ({ kind: 'sequence', particles, ...options }) as Group<'sequence', Ps, O>;

/**
 * Exactly one of these particles: the value is a union, one object per branch.
 *
 * @param particles - elements and groups
 * @param options - occurrences; repeated, every key is optional instead
 * @returns the group
 */
export const choice = <const Ps extends readonly Particle[], const O extends Occurs = NoProperties>(
    particles: Ps,
    options?: O
): Group<'choice', Ps, NoInfer<O>> =>
    ({ kind: 'choice', particles, ...options }) as Group<'choice', Ps, O>;

/**
 * These elements in any order. Only elements, and the group occurs at most once.
 *
 * @param particles - elements
 * @param options - occurrences
 * @returns the group
 */
export const all = <const Ps extends readonly Particle[], const O extends Occurs = NoProperties>(
    particles: Ps,
    options?: O
): Group<'all', Ps, NoInfer<O>> => ({ kind: 'all', particles, ...options }) as Group<'all', Ps, O>;

/**
 * A reference to an element declaration, for recursion: its getter is called when the schema is first used.
 * Annotate the getter's return type with `x.ElementOf<Key, Value>`, as TypeScript can't infer the type of a
 * value used in its own initializer. The reference's own `minOccurs` and `maxOccurs` apply.
 *
 * @param get - returns the declaration
 * @param options - occurrences
 * @returns the reference
 */
export const lazy = <const E extends Element, const O extends Occurs = NoProperties>(
    get: () => E,
    options?: O
): Simplify<NoInfer<O> & { readonly kind: 'lazy'; readonly get: () => E }> =>
    ({ kind: 'lazy', get, ...options }) as Simplify<
        O & { readonly kind: 'lazy'; readonly get: () => E }
    >;

/**
 * Options of an element wildcard.
 */
export type AnyOptions = Omit<Any, 'kind'>;

/**
 * An element wildcard: elements it allows are kept as `x.XmlNode`s under the `#any` key. As in XSD, it is
 * `processContents: 'strict'` by default, so each element needs one of its `declarations` (global element
 * declarations, matched by name) and is validated against it; `lax` validates only those with a declaration,
 * and `skip` none.
 *
 * @example
 * ```ts
 * x.any({ processContents: 'lax', declarations: () => [note], minOccurs: 0, maxOccurs: 'unbounded' })
 * ```
 *
 * @param options - namespace constraint, `processContents`, `declarations` and occurrences
 * @returns the wildcard
 */
export const any = <const O extends AnyOptions = NoProperties>(
    options?: O
): Simplify<NoInfer<O> & { readonly kind: 'any' }> =>
    ({ kind: 'any', ...options }) as Simplify<O & { readonly kind: 'any' }>;

/**
 * Options of an attribute wildcard.
 */
export type AnyAttributeOptions = Omit<AnyAttribute, 'kind'>;

/**
 * An attribute wildcard, among a complex type's `attributes`: attributes it allows are kept as
 * `x.XmlAttribute`s in `attributes['#any']`. As in XSD, it is `processContents: 'strict'` by default, so each
 * attribute needs one of its `declarations` (global attribute declarations, matched by name) and is validated
 * against it; `lax` validates only those with a declaration, and `skip` none.
 *
 * @param options - namespace constraint, `processContents` and `declarations`
 * @returns the wildcard
 */
export const anyAttribute = <const O extends AnyAttributeOptions = NoProperties>(
    options?: O
): Simplify<NoInfer<O> & { readonly kind: 'anyAttribute' }> =>
    ({ kind: 'anyAttribute', ...options }) as Simplify<O & { readonly kind: 'anyAttribute' }>;

/**
 * Options of an identity constraint: its namespace, and the prefixes its paths use.
 */
export type IdentityOptions = Pick<IdentityConstraintBase, 'namespace' | 'namespaces'>;

/**
 * An identity constraint as a builder returns it.
 *
 * @template Kind - which constraint
 * @template N - its name
 */
export type Identity<Kind extends 'key' | 'keyref' | 'unique', N extends string> = Simplify<
    IdentityConstraintBase & {
        readonly kind: Kind;
        readonly name: N;
    } & (Kind extends 'keyref' ? { readonly refer: IdentityName } : NoProperties)
>;

/**
 * Builds a `key` or `unique` constraint.
 *
 * @param kind - which constraint
 * @returns its builder
 */
const identityBuilder =
    <Kind extends 'key' | 'unique'>(kind: Kind) =>
    <const N extends string>(
        constraintName: N,
        selector: string,
        fields: readonly string[],
        options?: IdentityOptions
    ): Identity<Kind, N> =>
        ({ kind, name: constraintName, selector, fields, ...options }) as Identity<Kind, N>;

/**
 * An `xs:key` identity constraint, for an element declaration's `identity`: each element the selector selects has
 * a value for every field, and no two have equal values. Values compare in the XSD value space.
 *
 * @example
 * ```ts
 * x.key('sku', 'item', ['@sku'])
 * ```
 *
 * @param constraintName - its name, an NCName, which a keyref refers to it by
 * @param selector - XPath subset selecting elements from the declared element, e.g. `item` or `.//item`
 * @param fields - XPath subset selecting each value from a selected element, e.g. `@sku` or `code`
 * @param options - its namespace, and the prefixes its paths use
 * @returns the constraint
 */
export const key = identityBuilder('key');

/**
 * An `xs:unique` identity constraint, for an element declaration's `identity`: no two elements the selector
 * selects that have a value for every field have equal values. Values compare in the XSD value space.
 *
 * @param constraintName - its name, an NCName
 * @param selector - XPath subset selecting elements from the declared element, e.g. `item` or `.//item`
 * @param fields - XPath subset selecting each value from a selected element, e.g. `@sku` or `code`
 * @param options - its namespace, and the prefixes its paths use
 * @returns the constraint
 */
export const unique = identityBuilder('unique');

/**
 * An `xs:keyref` identity constraint, for an element declaration's `identity`: each element the selector
 * selects that has a value for every field has the values of an element that `refer` selected, in the declared
 * element or its descendants.
 *
 * @example
 * ```ts
 * x.keyref('itemSku', sku, './/line', ['@sku'])
 * ```
 *
 * @param constraintName - its name, an NCName
 * @param refer - the `key` or `unique` constraint it refers to, or its name and namespace
 * @param selector - XPath subset selecting elements from the declared element
 * @param fields - XPath subset selecting each value from a selected element, as many as `refer` has
 * @param options - its namespace, and the prefixes its paths use
 * @returns the constraint
 */
export const keyref = <const N extends string>(
    constraintName: N,
    refer: IdentityName,
    selector: string,
    fields: readonly string[],
    options?: IdentityOptions
): Identity<'keyref', N> => ({
    kind: 'keyref',
    name: constraintName,
    refer: {
        name: refer.name,
        ...(refer.namespace !== undefined && { namespace: refer.namespace }),
    },
    selector,
    fields,
    ...options,
});

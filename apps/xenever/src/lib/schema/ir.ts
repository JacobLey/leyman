import type { XmlAttribute, XmlNode } from './infer.js';

/**
 * The schema IR: plain, JSON-serializable data tagged by `kind`, which the `x` builders return and `parse`
 * reads. A hand-written `as const` literal of the same shape works too. The only functions are getters read when
 * the schema is first used: `x.lazy`'s, for recursion, and a wildcard's `declarations`.
 */

/**
 * Upper bound of a particle's occurrences: a positive integer, or `'unbounded'`.
 */
export type MaxOccurs = 'unbounded' | number;

/**
 * How many times a particle occurs. Both default to 1.
 */
export interface Occurs {
    /**
     * Non-negative integer. `0` makes the particle optional.
     */
    readonly minOccurs?: number;
    /**
     * Positive integer at least `minOccurs`, or `'unbounded'`. Above 1, the value is always an array.
     */
    readonly maxOccurs?: MaxOccurs;
}

/**
 * Built-in types whose value is a `string`, validated by their lexical rules.
 */
export type StringKind =
    | 'anyURI'
    | 'ENTITY'
    | 'ID'
    | 'IDREF'
    | 'language'
    | 'Name'
    | 'NCName'
    | 'NMTOKEN'
    | 'normalizedString'
    | 'string'
    | 'token';

/**
 * Built-in integer types whose whole range is a safe `number`.
 */
export type IntKind = 'byte' | 'int' | 'short' | 'unsignedByte' | 'unsignedInt' | 'unsignedShort';

/**
 * Built-in integer types whose range goes past `Number.MAX_SAFE_INTEGER`: a `number` (a value outside the
 * safe range is an error), or a `bigint` when flagged.
 */
export type BigIntegerKind =
    | 'integer'
    | 'long'
    | 'negativeInteger'
    | 'nonNegativeInteger'
    | 'nonPositiveInteger'
    | 'positiveInteger'
    | 'unsignedLong';

/**
 * Built-in floating point types: a `number`, including `INF`, `-INF` and `NaN`.
 */
export type FloatKind = 'double' | 'float';

/**
 * Built-in date, time and duration types: a `string`, validated lexically. The timezone is optional in XSD,
 * so a `Date` would lose it.
 */
export type DateKind =
    | 'date'
    | 'dateTime'
    | 'duration'
    | 'gDay'
    | 'gMonth'
    | 'gMonthDay'
    | 'gYear'
    | 'gYearMonth'
    | 'time';

/**
 * Built-in binary types: a `string` of the encoded value, validated.
 */
export type BinaryKind = 'base64Binary' | 'hexBinary';

/**
 * Every built-in (atomic) type.
 */
export type AtomicKind =
    | 'boolean'
    | 'decimal'
    | 'QName'
    | BigIntegerKind
    | BinaryKind
    | DateKind
    | FloatKind
    | IntKind
    | StringKind;

/**
 * The `pattern` facet: XSD regular expressions
 * ([XSD 1.1 Part 2 §G](https://www.w3.org/TR/xmlschema11-2/#regexs)), matched against the whole value after
 * whitespace processing. An array needs every pattern to match, as patterns from successive restrictions do;
 * alternatives of one restriction are one pattern joined with `|`.
 */
export interface PatternFacet {
    readonly pattern?: string | readonly string[];
}

/**
 * Length facets: characters for strings, octets for binary types, items for lists.
 */
export interface LengthFacets {
    readonly length?: number;
    readonly minLength?: number;
    readonly maxLength?: number;
}

/**
 * Range facets, in the type's value space.
 *
 * @template Value - a value in the type's value space
 */
export interface RangeFacets<Value> {
    readonly minInclusive?: Value;
    readonly maxInclusive?: Value;
    readonly minExclusive?: Value;
    readonly maxExclusive?: Value;
}

/**
 * Digit facets of decimal and integer types
 * ([XSD 1.1 Part 2 §4.3.11](https://www.w3.org/TR/xmlschema11-2/#rf-totalDigits)).
 */
export interface DigitsFacets {
    readonly totalDigits?: number;
    readonly fractionDigits?: number;
}

/**
 * A decimal number in the value space of decimal and integer types: a `number`, or a decimal string for a
 * value a `number` can't hold exactly.
 */
export type DecimalLiteral = number | string;

/**
 * Facets of string types. `enumeration` makes the value a literal union: each value must already be what
 * parsing it returns, i.e. valid for the type and unchanged by its whitespace processing.
 */
export interface StringFacets extends LengthFacets, PatternFacet {
    readonly enumeration?: readonly string[];
    /**
     * Whitespace processing ([XSD 1.1 Part 2 §4.3.6](https://www.w3.org/TR/xmlschema11-2/#rf-whiteSpace)),
     * only ever stricter than the type's own: `preserve` for `string`, `replace` for `normalizedString`,
     * `collapse` for the rest.
     */
    readonly whiteSpace?: 'collapse' | 'preserve' | 'replace';
}

/**
 * Facets of integer types whose value is a `number`.
 */
export interface IntFacets extends DigitsFacets, PatternFacet, RangeFacets<DecimalLiteral> {
    readonly enumeration?: readonly number[];
}

/**
 * Facets of integer types whose value is a `bigint`. JSON has no bigint, so enumeration values are integer
 * strings in canonical form (`'-5'`, not `'-05'` or `'+5'`).
 */
export interface BigIntFacets extends DigitsFacets, PatternFacet, RangeFacets<DecimalLiteral> {
    readonly enumeration?: readonly `${bigint}`[];
}

/**
 * Facets of `decimal`. Enumeration values are decimal strings in canonical form (`'1.5'`, `'2'`).
 */
export interface DecimalFacets extends DigitsFacets, PatternFacet, RangeFacets<DecimalLiteral> {
    readonly enumeration?: readonly string[];
}

/**
 * Facets of `float` and `double`. A `float` enumeration value must be exactly representable as a float.
 */
export interface FloatFacets extends PatternFacet, RangeFacets<number> {
    readonly enumeration?: readonly number[];
}

/**
 * A string type.
 */
export interface StringType {
    readonly kind: StringKind;
    readonly facets?: StringFacets;
}

/**
 * An integer type whose value is always a `number`.
 */
export interface IntType {
    readonly kind: IntKind;
    readonly facets?: IntFacets;
}

/**
 * An integer type whose value is a `number` unless `bigint` is set.
 */
export type BigIntegerType =
    | {
          readonly kind: BigIntegerKind;
          readonly bigint: true;
          readonly facets?: BigIntFacets;
      }
    | {
          readonly kind: BigIntegerKind;
          readonly bigint?: false;
          readonly facets?: IntFacets;
      };

/**
 * `decimal`, whose value is a string in canonical form
 * ([XSD 1.1 Part 2 §3.3.3.2](https://www.w3.org/TR/xmlschema11-2/#f-decimalCanmap)), so it stays exact.
 */
export interface DecimalType {
    readonly kind: 'decimal';
    readonly facets?: DecimalFacets;
}

/**
 * `float` or `double`.
 */
export interface FloatType {
    readonly kind: FloatKind;
    readonly facets?: FloatFacets;
}

/**
 * `boolean`: `true`, `false`, `1` or `0`.
 */
export interface BooleanType {
    readonly kind: 'boolean';
    readonly facets?: PatternFacet;
}

/**
 * A date, time or duration type.
 */
export interface DateType {
    readonly kind: DateKind;
    readonly facets?: PatternFacet;
}

/**
 * A binary type. Lengths count octets.
 */
export interface BinaryType {
    readonly kind: BinaryKind;
    readonly facets?: LengthFacets & PatternFacet;
}

/**
 * `QName`, resolved against the namespaces in scope where it is written.
 */
export interface QNameType {
    readonly kind: 'QName';
    readonly facets?: PatternFacet;
}

/**
 * A built-in type, optionally restricted by facets.
 */
export type AtomicType =
    | BigIntegerType
    | BinaryType
    | BooleanType
    | DateType
    | DecimalType
    | FloatType
    | IntType
    | QNameType
    | StringType;

/**
 * A whitespace-separated list of an atomic or union type
 * ([XSD 1.1 Part 2 §2.4.1.2](https://www.w3.org/TR/xmlschema11-2/#list-datatypes)). Lengths count items.
 */
export interface ListType {
    readonly kind: 'list';
    readonly item: AtomicType | UnionType;
    readonly facets?: LengthFacets & PatternFacet;
}

/**
 * A union of simple types: the value is that of the first member that accepts the text
 * ([XSD 1.1 Part 2 §2.4.1.3](https://www.w3.org/TR/xmlschema11-2/#union-datatypes)).
 */
export interface UnionType {
    readonly kind: 'union';
    readonly members: readonly SimpleType[];
    readonly facets?: PatternFacet;
}

/**
 * A simple type: the type of an attribute, or of an element with text and no attributes or children.
 */
export type SimpleType = AtomicType | ListType | UnionType;

/**
 * An attribute declaration.
 */
export interface Attribute {
    readonly kind: 'attribute';
    /**
     * Local name, an NCName.
     */
    readonly name: string;
    readonly type: SimpleType;
    /**
     * Namespace name. Absent for an unqualified attribute, the usual case.
     */
    readonly namespace?: string;
    /**
     * `optional` (the default) makes the key optional, unless there is a `default` or `fixed`.
     */
    readonly use?: 'optional' | 'required';
    /**
     * Key in `attributes`, instead of the local name: for two names that differ only by namespace. Must not
     * start with `#`, which marks synthetic keys.
     */
    readonly key?: string;
    /**
     * Value, as written in XML, of the attribute when absent, so its key is always present
     * ([XSD 1.1 Part 1 §3.2.1](https://www.w3.org/TR/xmlschema11-1/#Attribute_Declaration_details)). Only with
     * `use: 'optional'`; not with `fixed`.
     */
    readonly default?: string;
    /**
     * Value, as written in XML, the attribute must have when present (compared as values, so `01` matches `1`
     * for an integer), and has when absent. Not with `default`.
     */
    readonly fixed?: string;
}

/**
 * Which namespaces a wildcard allows: `namespace` lists the allowed namespace names, `notNamespace` the
 * disallowed ones, `null` standing for no namespace; neither allows any. XSD's `##other` is `notNamespace`
 * with the target namespace and `null` ([XSD 1.1 Part 1 §3.10](https://www.w3.org/TR/xmlschema11-1/#Wildcards)).
 */
export interface NamespaceConstraint {
    readonly namespace?: readonly (string | null)[];
    readonly notNamespace?: readonly (string | null)[];
}

/**
 * How a wildcard validates what it matches
 * ([XSD 1.1 Part 1 §3.10.1](https://www.w3.org/TR/xmlschema11-1/#Wildcard_details)): `strict` needs a global
 * declaration of the name among the wildcard's `declarations` and validates against it, `lax` validates
 * against one when there is one, and `skip` validates nothing.
 */
export type ProcessContents = 'lax' | 'skip' | 'strict';

/**
 * An attribute wildcard, in a complex type's `attributes`: undeclared attributes it allows are kept in
 * `attributes['#any']` as {@link XmlAttribute}s, in document order, whatever `processContents` validated;
 * declared attributes always take precedence.
 */
export interface AnyAttribute extends NamespaceConstraint {
    readonly kind: 'anyAttribute';
    /**
     * `strict` (the default, as in XSD), `lax` or `skip`.
     */
    readonly processContents?: ProcessContents;
    /**
     * The global attribute declarations an allowed attribute is validated against, by name, unless
     * `processContents` is `skip`. A getter, read when the schema is first used, as `x.lazy`'s is.
     */
    readonly declarations?: () => readonly Attribute[];
}

/**
 * An element wildcard, in a content model: elements it allows are kept as {@link XmlNode}s under the `#any`
 * key, whatever `processContents` validated, so the value's shape never depends on it. A child that a
 * declared element in the content model can match at that point is read as that element, as XSD 1.1 prefers
 * element declarations over wildcards ([XSD 1.1 Part 1 §3.8.6.4](https://www.w3.org/TR/xmlschema11-1/#cos-nonambig)).
 */
export interface Any extends NamespaceConstraint, Occurs {
    readonly kind: 'any';
    /**
     * `strict` (the default, as in XSD), `lax` or `skip`.
     */
    readonly processContents?: ProcessContents;
    /**
     * The global element declarations an allowed element is validated against, by name, unless
     * `processContents` is `skip`. A getter, read when the schema is first used, as `x.lazy`'s is, so it may
     * name declarations defined later.
     */
    readonly declarations?: () => readonly Element[];
}

/**
 * An element declaration: a global one passed to `parse`, or a local one in a content model.
 */
export interface Element extends Occurs {
    readonly kind: 'element';
    /**
     * Local name, an NCName.
     */
    readonly name: string;
    readonly type: ComplexType | SimpleType;
    /**
     * Namespace name. Absent for an element in no namespace.
     */
    readonly namespace?: string;
    /**
     * Key in `children`, instead of the local name: for two names that differ only by namespace. Must not
     * start with `#`, which marks synthetic keys.
     */
    readonly key?: string;
    /**
     * Whether the element may be `xsi:nil="true"`, which reads as `null`: its content must then be empty, and
     * its attributes are validated but dropped. `xsi:nil` on an element that isn't nillable is an error
     * ([XSD 1.1 Part 1 §3.3.4.4](https://www.w3.org/TR/xmlschema11-1/#cvc-elt), clause 3.1).
     */
    readonly nillable?: boolean;
    /**
     * Value, as written in XML, of the element when it is empty (no text or children at all, so `<a> </a>`
     * isn't). Only for a simple type or a complex type with `text`; not with `fixed`.
     */
    readonly default?: string;
    /**
     * Value, as written in XML, the element must have (compared as values), and has when empty. Only for a
     * simple type or a complex type with `text`; not with `default`.
     */
    readonly fixed?: string;
}

/**
 * Brand of {@link ElementOf}, never present at runtime.
 */
declare const elementOf: unique symbol;

/**
 * An element declaration with the key and value it has in `children`, to annotate the getter of `x.lazy`:
 * TypeScript can't infer the type of a value referenced in its own initializer.
 *
 * @example
 * ```ts
 * interface Tree { attributes: x.NoProperties; children: { tree?: Tree[] } }
 * const tree = x.element('tree', x.complex({
 *     content: x.sequence([
 *         x.lazy((): x.ElementOf<'tree', Tree> => tree, { minOccurs: 0, maxOccurs: 'unbounded' }),
 *     ]),
 * }));
 * ```
 *
 * @template Key - key in `children`
 * @template Value - value in `children`
 */
export type ElementOf<Key extends string, Value> = Element & {
    readonly [elementOf]?: { readonly key: Key; readonly value: Value };
} & ({ readonly key: Key } | { readonly key?: never; readonly name: Key });

/**
 * A reference to an element declaration, read when the schema is first used, for recursion. Like an XSD
 * element reference, its own `minOccurs` and `maxOccurs` apply, not those of the declaration.
 */
export interface Lazy extends Occurs {
    readonly kind: 'lazy';
    readonly get: () => Element;
}

/**
 * Elements in this order ([XSD 1.1 Part 1 §3.8](https://www.w3.org/TR/xmlschema11-1/#Model_Groups)).
 */
export interface Sequence extends Occurs {
    readonly kind: 'sequence';
    readonly particles: readonly Particle[];
}

/**
 * Exactly one of these particles.
 */
export interface Choice extends Occurs {
    readonly kind: 'choice';
    readonly particles: readonly Particle[];
}

/**
 * These elements in any order. Holds only elements (not groups); occurs at most once, optionally.
 */
export interface All extends Occurs {
    readonly kind: 'all';
    readonly particles: readonly Particle[];
}

/**
 * A model group.
 */
export type ModelGroup = All | Choice | Sequence;

/**
 * Something in a content model.
 */
export type Particle = Any | Element | Lazy | ModelGroup;

/**
 * A complex type: attributes, and either child elements (`content`), text (`text`, XSD's simpleContent), or
 * neither (empty).
 */
export interface ComplexType {
    readonly kind: 'complex';
    /**
     * Attribute declarations, and at most one attribute wildcard.
     */
    readonly attributes?: readonly (AnyAttribute | Attribute)[];
    readonly content?: ModelGroup;
    readonly text?: SimpleType;
    /**
     * Whether text may come between the child elements of `content`. Mixed content is always ordered, as the
     * text has nowhere to go in keyed children; each run of text, whitespace included, is a `#text` entry.
     */
    readonly mixed?: boolean;
    /**
     * Whether `children` is an array of `{ name, value }` entries in document order, `name` being the key,
     * rather than an object by key, which loses how different elements interleave. Only with `content`.
     */
    readonly ordered?: boolean;
}

/**
 * The type of an element.
 */
export type Type = ComplexType | SimpleType;

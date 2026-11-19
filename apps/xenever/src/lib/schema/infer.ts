import type {
    Any,
    AnyAttribute,
    AtomicType,
    Attribute,
    BigIntegerKind,
    ComplexOf,
    ComplexType,
    DateKind,
    ElementOf,
    FloatKind,
    IntKind,
    ListType,
    ModelGroup,
    Particle,
    SimpleType,
    UnionType,
} from './ir.js';

/**
 * Flattens an intersection into one object type, so it reads (and compares) as one.
 *
 * @template T - intersection to flatten
 */
type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * An object without properties: the `attributes` of an element that declares none.
 */
// eslint-disable-next-line @typescript-eslint/no-generated-empty-object-type -- intentionally declares no keys
export type NoProperties = Record<never, never>;

/**
 * Text in an {@link XmlNode}: character data, CDATA sections and references, adjacent runs merged.
 */
export interface XmlText {
    kind: 'text';
    text: string;
}

/**
 * An attribute that a wildcard allowed, as written: no type, so its value is the normalized text. Namespace
 * declarations aren't attributes.
 */
export interface XmlAttribute {
    namespace: string | null;
    localName: string;
    value: string;
}

/**
 * An element that a wildcard allowed, as written, children included. Prefixes are cosmetic, so only the
 * namespace name is kept; comments and processing instructions are dropped, and all text is kept.
 */
export interface XmlNode {
    kind: 'element';
    namespace: string | null;
    localName: string;
    attributes: XmlAttribute[];
    children: (XmlNode | XmlText)[];
    /**
     * Namespaces in scope at this element, its own declarations included: prefix to namespace name, the
     * default namespace under `''` (absent when there is none), and always `xml`. For resolving QNames written
     * in text or attribute values, such as `xsi:type="p:t"`, which the prefixes alone can't. A plain object, so
     * the node stays JSON; frozen, as elements with the same namespaces in scope share one.
     */
    readonly inScopeNamespaces: Readonly<Record<string, string>>;
}

/**
 * Value of a `QName`: the namespace name its prefix (or the default namespace) is bound to, and its local name.
 */
export interface QNameValue {
    namespace: string | null;
    localName: string;
}

/**
 * Value of a built-in type, without enumeration.
 *
 * @template T - the type
 */
type BaseValue<T extends AtomicType> = T['kind'] extends 'boolean'
    ? boolean
    : T['kind'] extends 'QName'
      ? QNameValue
      : T['kind'] extends FloatKind | IntKind
        ? number
        : T['kind'] extends BigIntegerKind
          ? T extends { readonly bigint: true }
              ? bigint
              : number
          : string;

/**
 * Enumeration value as it is parsed: bigint enumerations are written as strings.
 *
 * @template T - the type
 * @template E - enumeration value as written
 */
type EnumerationValue<T extends AtomicType, E> = T extends { readonly bigint: true }
    ? E extends `${infer N extends bigint}`
        ? N
        : never
    : E;

/**
 * Value of a built-in type: a literal union when enumerated, except dates, which match their enumeration by
 * value.
 *
 * @template T - the type
 */
type AtomicValue<T extends AtomicType> = T['kind'] extends DateKind
    ? string
    : T extends {
            readonly facets: { readonly enumeration: readonly (infer E)[] };
        }
      ? EnumerationValue<T, E>
      : BaseValue<T>;

/**
 * Value of a simple type: `unknown` for the whole `SimpleType` union, whose recursion through union members
 * has no end.
 *
 * @template T - the type
 */
export type SimpleValue<T extends SimpleType> = SimpleType extends T
    ? unknown
    : T extends ListType
      ? SimpleValue<T['item']>[]
      : T extends UnionType
        ? SimpleValue<T['members'][number]>
        : T extends AtomicType
          ? AtomicValue<T>
          : never;

/**
 * Key of a declaration: its `key`, else its name.
 *
 * @template D - a declaration
 */
type DeclarationKey<D> = D extends { readonly key: infer K extends string }
    ? K
    : D extends { readonly name: infer N extends string }
      ? N
      : never;

/**
 * `true` for an attribute that is always present: with `use: 'required'`, a `default` or a `fixed`.
 *
 * @template A - an attribute declaration
 */
type IsRequiredAttribute<A> = A extends { readonly use: 'required' }
    ? true
    : A extends { readonly default: string }
      ? true
      : A extends { readonly fixed: string }
        ? true
        : false;

/**
 * The `attributes` object of a complex type: each declaration's key, optional unless always present, and
 * `#any` for attributes a wildcard allowed.
 *
 * @template A - attribute declarations and wildcards
 */
type AttributesValue<A extends readonly (AnyAttribute | Attribute)[]> = Simplify<
    {
        [D in Extract<A[number], Attribute> as IsRequiredAttribute<D> extends true
            ? DeclarationKey<D>
            : never]: SimpleValue<D['type']>;
    } & {
        [D in Extract<A[number], Attribute> as IsRequiredAttribute<D> extends true
            ? never
            : DeclarationKey<D>]?: SimpleValue<D['type']>;
    } & (Extract<A[number], AnyAttribute> extends never
            ? NoProperties
            : Partial<Record<'#any', XmlAttribute[]>>)
>;

/**
 * Whether a particle may occur more than once: `boolean` for a `maxOccurs` widened to `number`.
 *
 * @template P - a particle
 */
type IsMany<P> = P extends { readonly maxOccurs: infer M }
    ? M extends 0 | 1 | undefined
        ? false
        : number extends M
          ? boolean
          : true
    : false;

/**
 * Count of a particle that may (`true`) or may not occur more than once, or either (`boolean`).
 *
 * @template Many - whether it may occur more than once
 */
type CountOf<Many extends boolean> = [Many] extends [false] ? 1 : [Many] extends [true] ? 2 : Count;

/**
 * Whether a particle may be absent. A `minOccurs` widened to `number` counts as absent.
 *
 * @template P - a particle
 */
type IsOptional<P> = P extends { readonly minOccurs: infer M }
    ? M extends 0
        ? true
        : number extends M
          ? true
          : false
    : false;

/**
 * Particles that stand for one element: an element declaration or a lazy reference to one.
 */
type ElementParticle = Exclude<Particle, ModelGroup>;

/**
 * The declaration a lazy reference's getter returns.
 *
 * @template P - a particle
 */
type Referenced<P> = P extends { readonly kind: 'lazy'; readonly get: () => infer E } ? E : P;

/**
 * Brand of {@link ElementOf}.
 */
type ElementOfBrand = symbol & keyof ElementOf<string, unknown>;

/**
 * Key an element particle has in `children`.
 *
 * @template P - a particle
 */
type ParticleKey<P> = P extends Any
    ? '#any'
    : Referenced<P> extends infer E
      ? ElementOfBrand extends keyof E
          ? NonNullable<E[ElementOfBrand]> extends { readonly key: infer K }
              ? K
              : never
          : DeclarationKey<E>
      : never;

/**
 * Value of an element declaration: the one its {@link ElementOf} annotation gives, else inferred from it.
 *
 * @template E - an element declaration
 */
type DeclarationValue<E> = ElementOfBrand extends keyof E
    ? NonNullable<E[ElementOfBrand]> extends { readonly value: infer V }
        ? V
        : never
    : ElementValue<E>;

/**
 * Value an element particle has in `children`, once per occurrence.
 *
 * @template P - a particle
 */
type ParticleValue<P> = P extends Any
    ? XmlNode
    : Referenced<P> extends infer E
      ? DeclarationValue<E>
      : never;

/**
 * Values of each key in a content model.
 *
 * @template P - a particle
 */
type Values<P> = P extends ElementParticle
    ? { [K in ParticleKey<P>]: ParticleValue<P> }
    : P extends ModelGroup
      ? MergeValues<P['particles']>
      : never;

/**
 * Values of each key in particles.
 *
 * @template Ps - particles
 */
type MergeValues<Ps extends readonly unknown[]> = Ps extends readonly [infer Head, ...infer Rest]
    ? MergeValues<Rest> & Values<Head>
    : Ps extends readonly []
      ? NoProperties
      : never;

/**
 * Maximum count of an element: once, or more than once.
 */
type Count = 1 | 2;

/**
 * Maximum count of each key in a content model, which decides whether its value is an array
 * (see `counts` in `content.ts`, which computes the same at runtime).
 *
 * @template P - a particle
 */
type Counts<P> = P extends Any
    ? Record<'#any', 2>
    : P extends ElementParticle
      ? { [K in ParticleKey<P>]: CountOf<IsMany<P>> }
      : P extends ModelGroup
        ? Repeat<
              P extends { readonly kind: 'choice' }
                  ? MaxCounts<P['particles']>
                  : SumCounts<P['particles']>,
              IsMany<P>
          >
        : never;

/**
 * Every count more than one when repeated.
 *
 * @template C - counts of each key
 * @template Many - whether it may occur more than once
 */
type Repeat<C, Many extends boolean> = [Many] extends [false]
    ? C
    : { [K in keyof C]: [Many] extends [true] ? 2 : 2 | C[K] };

/**
 * Counts of particles that may all occur (a sequence or all group): a key in more than one adds up to more
 * than once.
 *
 * @template Ps - particles
 */
type SumCounts<Ps extends readonly unknown[]> = Ps extends readonly [infer Head, ...infer Rest]
    ? SumCount<Counts<Head>, SumCounts<Rest>>
    : Ps extends readonly []
      ? NoProperties
      : never;

/**
 * Sum of two counts.
 *
 * @template A - counts of one particle
 * @template B - counts of another
 */
type SumCount<A, B> = {
    [K in keyof A | keyof B]: K extends keyof A ? (K extends keyof B ? 2 : A[K]) : B[K & keyof B];
};

/**
 * Counts of particles of which one occurs (a choice): the largest.
 *
 * @template Ps - particles
 */
type MaxCounts<Ps extends readonly unknown[]> = Ps extends readonly [infer Head, ...infer Rest]
    ? MaxCount<Counts<Head>, MaxCounts<Rest>>
    : Ps extends readonly []
      ? NoProperties
      : never;

/**
 * Larger of two counts.
 *
 * @template A - counts of one branch
 * @template B - counts of another
 */
type MaxCount<A, B> = {
    [K in keyof A | keyof B]: LargerCount<
        K extends keyof A ? A[K] : 0,
        K extends keyof B ? B[K] : 0
    >;
};

/**
 * Larger of two counts, either of which may be `0` (absent) or unknown (`Count`).
 *
 * @template A - one count
 * @template B - another count
 */
type LargerCount<A, B> = [A] extends [2]
    ? 2
    : [B] extends [2]
      ? 2
      : [A | B] extends [0 | 1]
        ? 1
        : Count;

/**
 * Keys present in one possible shape of `children`, each `true` when always present.
 *
 * @template P - a particle
 * @template Optional - whether a group around it may be absent
 * @template Repeated - whether a group around it repeats
 */
type Shapes<P, Optional extends boolean, Repeated extends boolean> = P extends ElementParticle
    ? {
          [K in ParticleKey<P>]: Optional extends true
              ? false
              : IsOptional<P> extends true
                ? false
                : true;
      }
    : P extends ModelGroup
      ? GroupShapes<
            P,
            Optional extends true ? true : IsOptional<P>,
            Repeated extends true ? true : IsMany<P>
        >
      : never;

/**
 * Shapes of a model group. A choice is a union of its branches, unless repeated (here or by a group around it),
 * when each branch may occur and every key is optional.
 *
 * @template G - a model group
 * @template Optional - whether a group around it may be absent
 * @template Repeated - whether a group around it repeats
 */
type GroupShapes<
    G extends ModelGroup,
    Optional extends boolean,
    Repeated extends boolean,
> = G extends {
    readonly kind: 'choice';
}
    ? Repeated extends true
        ? ProductShapes<G['particles'], true, true>
        : UnionShapes<G['particles'], Optional>
    : ProductShapes<G['particles'], Optional, Repeated>;

/**
 * One shape per branch.
 *
 * @template Ps - particles
 * @template Optional - whether a group around it may be absent
 */
type UnionShapes<Ps extends readonly unknown[], Optional extends boolean> = Ps extends readonly [
    infer Head,
    ...infer Rest,
]
    ? Shapes<Head, Optional, false> | UnionShapes<Rest, Optional>
    : Ps extends readonly []
      ? never
      : never;

/**
 * Shapes of particles that all occur: each combination of their shapes.
 *
 * @template Ps - particles
 * @template Optional - whether a group around it may be absent
 * @template Repeated - whether a group around it repeats
 */
type ProductShapes<
    Ps extends readonly unknown[],
    Optional extends boolean,
    Repeated extends boolean,
> = Ps extends readonly [infer Head, ...infer Rest]
    ? Product<Shapes<Head, Optional, Repeated>, ProductShapes<Rest, Optional, Repeated>>
    : Ps extends readonly []
      ? NoProperties
      : never;

/**
 * Each combination of two unions of shapes, merged: a key is always present when it is in either.
 *
 * @template A - shapes of one particle
 * @template B - shapes of another
 */
type Product<A, B> = A extends unknown
    ? B extends unknown
        ? {
              [K in keyof A | keyof B]: true extends
                  | (K extends keyof A ? A[K] : false)
                  | (K extends keyof B ? B[K] : false)
                  ? true
                  : false;
          }
        : never
    : never;

/**
 * Value of a key: an array when it may occur more than once.
 *
 * @template V - value of one occurrence
 * @template C - count of the key
 */
type KeyValue<V, C> = C extends 2 ? V[] : V;

/**
 * Turns each shape into an object type; keys of other shapes are `?: never`, so a union of them discriminates.
 *
 * @template S - union of shapes, one per branch
 * @template V - values of each key
 * @template C - counts of each key
 */
type ShapesToObjects<S, V, C> = S extends unknown
    ? Simplify<
          Partial<Record<Exclude<keyof V, keyof S>, never>> & {
              [K in keyof S as S[K] extends true ? K : never]: KeyValue<
                  V[K & keyof V],
                  C[K & keyof C]
              >;
          } & {
              [K in keyof S as S[K] extends true ? never : K]?: KeyValue<
                  V[K & keyof V],
                  C[K & keyof C]
              >;
          }
      >
    : never;

/**
 * Whether a particle has a model group whose particles are an array rather than a tuple, so the type can't know
 * their count or order.
 *
 * @template P - a particle
 */
type IsWide<P> = P extends ModelGroup
    ? P['particles'] extends readonly [] | readonly [unknown, ...unknown[]]
        ? IsWideTuple<P['particles']>
        : true
    : false;

/**
 * Whether any of a tuple of particles is wide.
 *
 * @template Ps - particles
 */
type IsWideTuple<Ps extends readonly unknown[]> = Ps extends readonly [infer Head, ...infer Rest]
    ? true extends IsWide<Head>
        ? true
        : IsWideTuple<Rest>
    : false;

/**
 * Value of `children`: a record of unknown values when the particles aren't tuples (builders and `as const`
 * always make tuples).
 *
 * @template G - the content model
 */
export type ChildrenValue<G extends ModelGroup> =
    true extends IsWide<G>
        ? Record<string, unknown>
        : ShapesToObjects<Shapes<G, false, false>, Simplify<Values<G>>, Counts<G>>;

/**
 * An entry of ordered `children`, per key.
 *
 * @template V - values of each key
 */
type Entries<V> = { [K in keyof V]: { name: K; value: V[K] } }[keyof V];

/**
 * Value of ordered `children`: entries in document order, with text entries for mixed content.
 *
 * @template G - the content model
 * @template Mixed - whether it is mixed
 */
export type OrderedChildrenValue<G extends ModelGroup, Mixed extends boolean> = (
    | (Mixed extends true ? { name: '#text'; value: string } : never)
    | (true extends IsWide<G> ? { name: string; value: unknown } : Entries<Simplify<Values<G>>>)
)[];

/**
 * Value of `mixed` or `ordered` in a complex type, `false` when absent.
 *
 * @template T - the type
 * @template K - `mixed` or `ordered`
 */
type FlagOf<T, K extends 'mixed' | 'ordered'> =
    T extends Readonly<Record<K, infer V extends boolean>> ? V : false;

/**
 * Value of `children`, keyed or ordered.
 *
 * @template G - the content model
 * @template Mixed - whether it is mixed
 * @template Ordered - whether it is ordered
 */
type ContentValue<
    G extends ModelGroup,
    Mixed extends boolean,
    Ordered extends boolean,
> = Mixed extends true
    ? OrderedChildrenValue<G, true>
    : Ordered extends true
      ? OrderedChildrenValue<G, false>
      : ChildrenValue<G>;

/**
 * Value of a complex type.
 *
 * @template T - the type
 */
export type ComplexValue<T extends ComplexType> = Simplify<
    {
        attributes: T extends {
            readonly attributes: infer A extends readonly (AnyAttribute | Attribute)[];
        }
            ? AttributesValue<A>
            : NoProperties;
    } & (T extends { readonly content: infer G extends ModelGroup }
        ? { children: ContentValue<G, FlagOf<T, 'mixed'>, FlagOf<T, 'ordered'>> }
        : T extends { readonly text: infer S extends SimpleType }
          ? { text: SimpleValue<S> }
          : NoProperties)
>;

/**
 * Brand of {@link ComplexOf}.
 */
type ComplexOfBrand = symbol & keyof ComplexOf<string, unknown>;

/**
 * Value of an element read as one of the complex types its `xsi:type` may select: the type's value (the one
 * its `x.ComplexOf` annotation gives, if any), with the type's key as `type`. An abstract type is never what
 * an element is read as.
 *
 * @template T - the declared type and those of `types`, as a union
 */
export type TypedValue<T> = T extends ComplexType
    ? ComplexOfBrand extends keyof T
        ? NonNullable<T[ComplexOfBrand]> extends { readonly key: infer K; readonly value: infer V }
            ? V & { type: K }
            : never
        : T extends { readonly abstract: true }
          ? never
          : ComplexValue<T> & { type: DeclarationKey<T> }
    : never;

/**
 * What `parse` returns for an element: its simple value, or an object of attributes and content; `null`
 * too when nillable. With `types`, a union over its type and each of them, told apart by `type`. An abstract
 * element is never in a document, and an element of an abstract type without `types` never valid, so they
 * have no value.
 *
 * @template E - an element declaration
 */
export type ElementValue<E> = E extends { readonly abstract: true }
    ? never
    : E extends { readonly type: infer T }
      ?
            | (E extends { readonly nillable: infer N } ? (true extends N ? null : never) : never)
            | (E extends { readonly types: () => infer A extends readonly ComplexType[] }
                  ? TypedValue<A[number] | T>
                  : T extends ComplexType
                    ? T extends { readonly abstract: true }
                        ? never
                        : ComplexValue<T>
                    : T extends SimpleType
                      ? SimpleValue<T>
                      : never)
      : never;

/**
 * The value `parse` returns for a declaration: of an element (the value its `x.ElementOf` annotation gives,
 * if any), a complex type or a simple type.
 *
 * @template T - a declaration or type
 */
export type Infer<T> = T extends { readonly kind: 'element' }
    ? DeclarationValue<T>
    : T extends ComplexType
      ? ComplexValue<T>
      : T extends SimpleType
        ? SimpleValue<T>
        : never;

/**
 * Documentation attached to a generated type or property, rendered as JSDoc.
 */
export interface TsDoc {
    readonly deprecated: boolean;
    readonly description: string | null;
    /**
     * JSDoc tags, e.g. `{ name: 'default', text: '5' }` for `@default 5`.
     */
    readonly tags: readonly { readonly name: string; readonly text: string }[];
    readonly title: string | null;
}

/**
 * A schema's text for documentation: `null` unless it's a non-empty string.
 *
 * @param value - e.g. a `description` keyword's value
 * @returns the text, or `null`
 */
export const docText = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null;

export interface TsProperty {
    readonly doc: TsDoc | null;
    readonly name: string;
    readonly optional: boolean;
    readonly type: TsType;
}

/**
 * Index signature. `key` is `string`, or a template literal for keys matching a pattern.
 */
export interface TsIndex {
    readonly key: TsType;
    readonly value: TsType;
}

export interface TsTupleElement {
    readonly optional: boolean;
    readonly type: TsType;
}

/**
 * Part of a template literal type: literal text, or any string.
 */
export type TsTemplatePart =
    | { readonly kind: 'string' }
    | { readonly kind: 'text'; readonly text: string };

/**
 * Minimal model of a TypeScript type, built from a schema and then printed.
 *
 * Building a model (rather than printing directly) lets types be simplified as they are combined,
 * e.g. `(string | null) & string` is generated as `string`, not left for TypeScript to reduce.
 */
export type TsType =
    | {
          readonly kind: 'keyword';
          readonly keyword:
              | 'boolean'
              | 'never'
              | 'null'
              | 'number'
              | 'object'
              | 'string'
              | 'unknown';
      }
    | {
          readonly kind: 'object';
          readonly index: readonly TsIndex[];
          readonly properties: readonly TsProperty[];
      }
    | {
          readonly kind: 'tuple';
          readonly elements: readonly TsTupleElement[];
          readonly rest: TsType | null;
      }
    | { readonly kind: 'array'; readonly element: TsType }
    | { readonly kind: 'intersection'; readonly members: readonly TsType[] }
    | { readonly kind: 'literal'; readonly value: boolean | number | string }
    | { readonly kind: 'reference'; readonly name: string }
    | { readonly kind: 'template'; readonly parts: readonly TsTemplatePart[] }
    | { readonly kind: 'union'; readonly members: readonly TsType[] };

export const unknownType: TsType = { kind: 'keyword', keyword: 'unknown' };
export const neverType: TsType = { kind: 'keyword', keyword: 'never' };
export const stringType: TsType = { kind: 'keyword', keyword: 'string' };
export const numberType: TsType = { kind: 'keyword', keyword: 'number' };
export const booleanType: TsType = { kind: 'keyword', keyword: 'boolean' };
export const nullType: TsType = { kind: 'keyword', keyword: 'null' };
/**
 * Any object, printed as `Record<string, unknown>`.
 */
export const objectType: TsType = { kind: 'keyword', keyword: 'object' };

/**
 * Unions are distributed over intersections (`(A | B) & C` => `(A & C) | (B & C)`) to simplify them,
 * unless that would create more members than this.
 */
const maxDistributedMembers = 32;

const typeKey = (type: TsType): string => JSON.stringify(type);

const isKeyword = (type: TsType, keyword: TsType & { kind: 'keyword' }): boolean =>
    type.kind === 'keyword' && type.keyword === keyword.keyword;

/**
 * Which kind of JSON value a type describes, if it describes only one.
 * Two types of different classes never overlap, so their intersection is `never`.
 *
 * @param type - type to classify
 * @returns class of value, or `null` if unknown or mixed
 */
const valueClass = (
    type: TsType
): 'array' | 'boolean' | 'null' | 'number' | 'object' | 'string' | null => {
    if (type.kind === 'keyword') {
        const { keyword } = type;
        return keyword === 'never' || keyword === 'unknown' ? null : keyword;
    }
    if (type.kind === 'literal') {
        return typeof type.value as 'boolean' | 'number' | 'string';
    }
    if (type.kind === 'template') {
        return 'string';
    }
    if (type.kind === 'array' || type.kind === 'tuple') {
        return 'array';
    }
    if (type.kind === 'union') {
        // E.g. the branches of a `oneOf` of objects, so a sibling `type: "object"` is redundant.
        // Only objects with a required property: TypeScript lets primitives into `{}` or `{ a?: T }`
        const [first, ...rest] = type.members.map(member =>
            member.kind === 'object' && member.properties.every(property => property.optional)
                ? null
                : valueClass(member)
        );
        return first !== undefined && rest.every(memberClass => memberClass === first)
            ? first
            : null;
    }
    return type.kind === 'object' ? 'object' : null;
};

/**
 * Whether a type allows every value of its class, e.g. `string`, `unknown[]` or any object.
 *
 * @param type - type to check
 * @returns true if every value of the type's class is allowed
 */
const isClassTop = (type: TsType): boolean =>
    (type.kind === 'keyword' && valueClass(type) !== null) ||
    (type.kind === 'array' && isKeyword(type.element, unknownType));

/**
 * Create a union of types. Nested unions are flattened, duplicates removed,
 * and literals dropped when their primitive (e.g. `string`) is also a member.
 *
 * @param members - types to union
 * @returns union type, or its only member
 */
export const union = (members: readonly TsType[]): TsType => {
    const flat = members.flatMap(member => (member.kind === 'union' ? member.members : member));
    if (flat.some(member => isKeyword(member, unknownType))) {
        return unknownType;
    }
    const primitives: ReadonlySet<string | null> = new Set(
        flat.flatMap(member => (member.kind === 'keyword' ? member.keyword : []))
    );
    const seen = new Set<string>();
    const result: TsType[] = [];
    for (const member of flat) {
        const key = typeKey(member);
        if (
            isKeyword(member, neverType) ||
            seen.has(key) ||
            ((member.kind === 'literal' || member.kind === 'template') &&
                primitives.has(valueClass(member)))
        ) {
            continue;
        }

        seen.add(key);
        result.push(member);
    }
    if (result.length === 0) {
        return neverType;
    }
    return result.length === 1 ? result[0]! : { kind: 'union', members: result };
};

/**
 * Merge object types of an intersection into one object type.
 * A key in both is required if required in either, and its type is the intersection of both.
 *
 * @param objects - object types to merge
 * @returns single object type
 */
const mergeObjects = (objects: readonly (TsType & { kind: 'object' })[]): TsType => {
    const properties = new Map<string, TsProperty>();
    for (const object of objects) {
        for (const property of object.properties) {
            const existing = properties.get(property.name);
            properties.set(
                property.name,
                existing
                    ? {
                          doc: existing.doc ?? property.doc,
                          name: property.name,
                          optional: existing.optional && property.optional,
                          // eslint-disable-next-line @typescript-eslint/no-use-before-define -- `intersection` and this function call each other
                          type: intersection([existing.type, property.type]),
                      }
                    : property
            );
        }
    }
    return {
        kind: 'object',
        index: objects.flatMap(object => object.index),
        properties: properties.values().toArray(),
    };
};

/**
 * Merge the arrays of an intersection (and at most one tuple) into one, intersecting their items,
 * e.g. `string[] & [unknown, ...unknown[]]` => `[string, ...string[]]`.
 * Two tuples are left as an intersection.
 *
 * @param members - members of an intersection
 * @returns members, with the arrays merged
 */
const mergeArrays = (members: TsType[]): TsType[] => {
    const arrays = members.filter(member => member.kind === 'array');
    const tuples = members.filter(member => member.kind === 'tuple');
    const [tuple] = tuples;
    if (arrays.length === 0 || tuples.length > 1 || (!tuple && arrays.length === 1)) {
        return members;
    }
    // eslint-disable-next-line @typescript-eslint/no-use-before-define -- `intersection` and this function call each other
    const element = intersection(arrays.map(array => array.element));
    const merged: TsType = tuple
        ? {
              kind: 'tuple',
              elements: tuple.elements.map(item => ({
                  optional: item.optional,
                  // eslint-disable-next-line @typescript-eslint/no-use-before-define -- `intersection` and this function call each other
                  type: intersection([item.type, element]),
              })),
              // eslint-disable-next-line @typescript-eslint/no-use-before-define -- `intersection` and this function call each other
              rest: tuple.rest && intersection([tuple.rest, element]),
          }
        : { kind: 'array', element };
    return [
        ...members.filter(member => member.kind !== 'array' && member.kind !== 'tuple'),
        merged,
    ];
};

/**
 * Intersect types whose members are not unions.
 *
 * @param members - types to intersect, none of which are unions
 * @returns intersection type, or its only member
 */
const intersectFlat = (members: readonly TsType[]): TsType => {
    if (members.some(member => isKeyword(member, neverType))) {
        return neverType;
    }
    const classes = new Set(
        members.map(member => valueClass(member)).filter(memberClass => memberClass !== null)
    );
    if (classes.size > 1) {
        return neverType;
    }

    const seen = new Set<string>();
    const others: TsType[] = [];
    const objects: (TsType & { kind: 'object' })[] = [];
    const literals: (TsType & { kind: 'literal' })[] = [];
    for (const member of members) {
        const key = typeKey(member);
        if (isKeyword(member, unknownType) || seen.has(key)) {
            continue;
        }

        seen.add(key);
        if (member.kind === 'object') {
            objects.push(member);
        } else if (member.kind === 'literal') {
            literals.push(member);
        } else {
            others.push(member);
        }
    }
    if (literals.length > 1) {
        // Literals are only equal if they are the same key
        return neverType;
    }
    // A type that allows every value of its class (e.g. `string` or `unknown[]`)
    // is redundant next to a narrower type of the same class, e.g. `string & 'a'`
    const kept = [...(objects.length > 0 ? [mergeObjects(objects)] : []), ...literals, ...others];
    const narrowed = mergeArrays(
        kept.filter(
            member =>
                !(
                    isClassTop(member) &&
                    kept.some(other => other !== member && valueClass(other) === valueClass(member))
                )
        )
    );

    if (narrowed.length === 0) {
        return unknownType;
    }
    return narrowed.length === 1 ? narrowed[0]! : { kind: 'intersection', members: narrowed };
};

/**
 * Create an intersection of types. Nested intersections are flattened, `unknown` dropped,
 * and unions distributed when small enough, so impossible combinations reduce to `never`.
 *
 * @param members - types to intersect
 * @returns intersection type, or a union of intersections
 */
export const intersection = (members: readonly TsType[]): TsType => {
    const flat = members.flatMap(member =>
        member.kind === 'intersection' ? member.members : member
    );
    const unions = flat.filter(member => member.kind === 'union');
    const combinations = unions.reduce((count, member) => count * member.members.length, 1);
    // Only primitives and arrays reduce when distributed, e.g. `(string | null) & string` => `string`.
    // Objects would only be repeated in each member, e.g. `{ a: string } & ({ b?: never } | { c: number })`
    const canReduce = [...flat, ...unions.flatMap(member => member.members)].some(member => {
        const memberClass = valueClass(member);
        return memberClass !== null && memberClass !== 'object';
    });
    if (
        !canReduce ||
        unions.length === 0 ||
        // A single union only distributes over the other members, which never grows the type
        (unions.length > 1 && combinations > maxDistributedMembers)
    ) {
        return intersectFlat(flat);
    }
    const nonUnions = flat.filter(member => member.kind !== 'union');
    let distributed: TsType[][] = [nonUnions];
    for (const member of unions) {
        distributed = distributed.flatMap(combination =>
            member.members.map(option => [...combination, option])
        );
    }
    return union(distributed.map(combination => intersection(combination)));
};

/**
 * Remove members of a union that are exactly one of `excluded`.
 * Used for `not`, where only an exact match can be removed safely.
 *
 * @param type - type to remove from
 * @param excluded - types to remove
 * @returns type without the excluded members
 */
export const exclude = (type: TsType, excluded: readonly TsType[]): TsType => {
    const keys = new Set(excluded.map(member => typeKey(member)));
    const members = type.kind === 'union' ? type.members : [type];
    return union(members.filter(member => !keys.has(typeKey(member))));
};

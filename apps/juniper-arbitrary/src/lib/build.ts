import type { Branch, SchemaNode, TypeName } from './flatten.js';
import * as fc from 'fast-check';
import { UnsatisfiableSchemaError } from './errors.js';
import { filtered, LazyArbitrary } from './filtered-arbitrary.js';
import { flatten } from './flatten.js';
import { canonicalJson } from './json.js';
import { numberArbitrary } from './numbers.js';
import { stringArbitrary, stringsMatching } from './strings.js';

type ValueArbitrary = fc.Arbitrary<unknown>;

/**
 * Marks an optional property left out, since a generated value never holds `undefined`.
 */
const absent = Symbol('absent');

/**
 * Undeclared properties are valid unless forbidden, and worth generating since real payloads
 * have them, but a few are enough to not drown out the declared ones.
 */
const maxOpenProperties = 3;

// Through JSON because `jsonValue()` nests `-0`, which isn't one (see `withoutNegativeZero`)
const anyValue: ValueArbitrary = fc
    .jsonValue({ maxDepth: 2 })
    // eslint-disable-next-line unicorn/prefer-structured-clone -- JSON is the point
    .map(value => JSON.parse(JSON.stringify(value)) as unknown);

/**
 * How deep a recursive schema goes. Each level multiplies the size of a value by its branching,
 * so this is small: deeper values add little that a few levels haven't already exercised.
 */
const maxDepth = 4;

interface Built {
    readonly arbitrary: ValueArbitrary;
    /**
     * Whether it reaches a schema still being built, so isn't guaranteed to bottom out.
     * At the depth limit fast-check takes the first choice, which must be one that does.
     */
    readonly recursive: boolean;
}

interface BuiltType extends Built {
    /**
     * Whether every value is valid, so no validator is needed for this part of the schema.
     */
    readonly exact: boolean;
}

/**
 * Whether `patternProperties` covers a key, leaving it out of what `additionalProperties` applies to.
 *
 * @param patterns - `patternProperties` keys
 * @param key - property name
 * @returns if a pattern matches
 */
const isCoveredByPattern = (patterns: readonly RegExp[], key: string): boolean =>
    patterns.some(pattern => pattern.test(key));

const mergePrefixes = (
    prefixItems: readonly (readonly SchemaNode[])[]
): readonly (readonly SchemaNode[])[] => {
    const merged: SchemaNode[][] = [];
    for (const prefix of prefixItems) {
        for (const [index, node] of prefix.entries()) {
            merged[index] = [...(merged[index] ?? []), node];
        }
    }
    return merged;
};

/**
 * Whether a value has any of the types, to drop `enum` values that can never validate.
 *
 * @param value - JSON value
 * @param types - allowed types
 * @returns if its type is allowed
 */
const hasAnyType = (value: unknown, types: ReadonlySet<TypeName>): boolean => {
    if (value === null) {
        return types.has('null');
    }
    if (Array.isArray(value)) {
        return types.has('array');
    }
    if (typeof value === 'number') {
        return (
            types.has('number') ||
            // eslint-disable-next-line unicorn/prefer-number-is-safe-integer -- JSON Schema's `integer` has no size limit
            (types.has('integer') && Number.isInteger(value))
        );
    }
    return types.has(typeof value as TypeName);
};

// `number` already generates integers
const effectiveTypes = (types: ReadonlySet<TypeName>): readonly TypeName[] =>
    [...types].filter(type => type !== 'integer' || !types.has('number'));

export interface BuilderParams {
    readonly root: SchemaNode;
    /**
     * Compile a validator of one part of the schema, only called when its values need checking.
     */
    readonly validatorFor: (node: SchemaNode, path: string) => (value: unknown) => boolean;
}

/**
 * Builds arbitraries from one root schema, sharing them across its parts.
 */
export class Builder {
    readonly #depthIdentifier = fc.createDepthIdentifier();
    /**
     * Built schemas by content, so a schema reaching itself finds its own entry.
     * Null when nothing can match. Absent while still being built.
     */
    readonly #memo = new Map<string, Built | null>();
    readonly #inProgress = new Set<string>();
    readonly #params: BuilderParams;

    public constructor(params: BuilderParams) {
        this.#params = params;
    }

    /**
     * Build an arbitrary of a schema, sharing what it has already built for the same content.
     *
     * @param node - schema
     * @param path - path of the schema, for errors
     * @returns arbitrary of the schema's values, or null when nothing can match
     */
    public build(node: SchemaNode, path: string): ValueArbitrary | null {
        return this.#build(node, path)?.arbitrary ?? null;
    }

    #build(node: SchemaNode, path: string): Built | null {
        const key = JSON.stringify(node);
        const memoized = this.#memo.get(key);
        if (memoized !== undefined) {
            return memoized;
        }
        if (this.#inProgress.has(key)) {
            return {
                arbitrary: new LazyArbitrary(() => {
                    const resolved = this.#memo.get(key);
                    if (!resolved) {
                        throw new UnsatisfiableSchemaError('Recursion never bottoms out', path);
                    }
                    return resolved.arbitrary;
                }, path),
                recursive: true,
            };
        }
        this.#inProgress.add(key);
        const built = this.#buildUncached(node, path);
        this.#inProgress.delete(key);
        this.#memo.set(key, built);
        return built;
    }

    #buildUncached(node: SchemaNode, path: string): Built | null {
        const results = flatten(this.#params.root, node, path).flatMap(branch =>
            this.#buildBranch(branch, path)
        );
        const chosen = this.#choose(results);
        if (!chosen) {
            return null;
        }
        return results.every(result => result.exact)
            ? chosen
            : {
                  arbitrary: filtered(chosen.arbitrary, this.#lazyValidator(node, path), path),
                  recursive: chosen.recursive,
              };
    }

    #lazyValidator(node: SchemaNode, path: string): (value: unknown) => boolean {
        let validator: ((value: unknown) => boolean) | undefined;
        return value => {
            validator ??= this.#params.validatorFor(node, path);
            return validator(value);
        };
    }

    #choose(results: readonly Built[]): Built | null {
        const [first, ...rest] = results.toSorted(
            (a, b) => Number(a.recursive) - Number(b.recursive)
        );
        if (!first) {
            return null;
        }
        if (rest.length === 0) {
            return first;
        }
        return {
            arbitrary: fc.oneof(
                { maxDepth, depthIdentifier: this.#depthIdentifier, withCrossShrink: true },
                first.arbitrary,
                ...rest.map(result => result.arbitrary)
            ),
            recursive: first.recursive,
        };
    }

    /**
     * Only `oneof` and `option` count depth, and at the limit they take their first choice, so a
     * recursive collection offers the smallest one it can be first, or it would never stop.
     *
     * @param smallest - collection at its minimum size
     * @param collection - collection at any size
     * @returns collection that stops growing at the depth limit
     */
    #limitDepth<T>(smallest: fc.Arbitrary<T>, collection: fc.Arbitrary<T>): fc.Arbitrary<T> {
        return fc.oneof({ maxDepth, depthIdentifier: this.#depthIdentifier }, smallest, collection);
    }

    #buildBranch(branch: Branch, path: string): BuiltType[] {
        if (branch.enum) {
            const allowed = branch.enum.filter(value => hasAnyType(value, branch.types));
            const [first, ...rest] = allowed;
            if (allowed.length === 0) {
                return [];
            }
            return [
                {
                    arbitrary: rest.length === 0 ? fc.constant(first) : fc.constantFrom(...allowed),
                    // Whatever else the branch says about these values is left to the validator
                    exact: false,
                    recursive: false,
                },
            ];
        }
        const results: BuiltType[] = [];
        for (const type of effectiveTypes(branch.types)) {
            const result = this.#buildType(branch, type, path);
            if (result) {
                results.push(result);
            }
        }
        const isExact = !branch.residual;
        return results.map(result => ({ ...result, exact: result.exact && isExact }));
    }

    #buildType(branch: Branch, type: TypeName, path: string): BuiltType | null {
        if (type === 'null') {
            return { arbitrary: fc.constant(null), exact: true, recursive: false };
        }
        if (type === 'boolean') {
            return { arbitrary: fc.boolean(), exact: true, recursive: false };
        }
        if (type === 'array') {
            return this.#buildArray(branch, path);
        }
        if (type === 'object') {
            return this.#buildObject(branch, path);
        }
        const result =
            type === 'string'
                ? stringArbitrary(branch)
                : numberArbitrary(branch, type === 'integer');
        return result && { ...result, recursive: false };
    }

    #combined(nodes: readonly SchemaNode[], path: string): Built | null {
        // Without duplicates: a schema reaching itself through `allOf` would otherwise get one
        // longer each time, and never find its own entry in the memo
        const byContent = new Map(nodes.map(node => [JSON.stringify(node), node]));
        const unique = byContent.values().toArray();
        const [first, ...rest] = unique;
        if (first === undefined) {
            return { arbitrary: anyValue, recursive: false };
        }
        return this.#build(rest.length === 0 ? first : { allOf: unique }, path);
    }

    #buildArray(branch: Branch, path: string): BuiltType | null {
        const { contains, maxContains, maxItems, minContains, minItems, prefixItems, uniqueItems } =
            branch;
        if (minItems > maxItems) {
            return null;
        }
        // Past the first item that can't exist, no array can be longer
        const prefixNodes = mergePrefixes(prefixItems);
        const prefix: Built[] = [];
        for (const [index, nodes] of prefixNodes.entries()) {
            const built = this.#combined(nodes, `${path}/prefixItems/${index}`);
            if (!built) {
                break;
            }
            prefix.push(built);
        }
        const isBlocked = prefix.length < prefixNodes.length;
        const items = isBlocked ? null : this.#combined(branch.items, `${path}/items`);

        const required = contains.length > 0 ? (minContains ?? 1) : 0;
        const contained =
            required > 0
                ? this.#combined([...contains, ...branch.items], `${path}/contains`)
                : null;
        if (!contained && required > 0) {
            return null;
        }

        const restMin = Math.max(0, minItems - prefix.length - required);
        const restMax = maxItems - prefix.length - required;
        const minimumLength = prefix.length + required + restMin;
        if (!items && minimumLength > prefix.length + required) {
            return null;
        }
        if (restMax < 0 && required > 0) {
            return null;
        }

        const arrayConstraints = {
            depthIdentifier: this.#depthIdentifier,
            minLength: restMin,
            ...(restMax < Number.POSITIVE_INFINITY && { maxLength: Math.max(restMax, 0) }),
        };
        let restArbitrary: fc.Arbitrary<unknown[]> = fc.constant([]);
        if (items) {
            const anyLength =
                uniqueItems && !contained && prefix.length === 0
                    ? fc.uniqueArray(items.arbitrary, {
                          ...arrayConstraints,
                          selector: canonicalJson,
                      })
                    : fc.array(items.arbitrary, arrayConstraints);
            restArbitrary = items.recursive
                ? this.#limitDepth(
                      fc.array(items.arbitrary, { minLength: restMin, maxLength: restMin }),
                      anyLength
                  )
                : anyLength;
        }

        const prefixArbitrary = fc.tuple(...prefix.map(built => built.arbitrary));
        const containedArbitrary: fc.Arbitrary<unknown[]> = contained
            ? fc.array(contained.arbitrary, {
                  minLength: required,
                  maxLength: required,
                  depthIdentifier: this.#depthIdentifier,
              })
            : fc.constant([]);

        const arbitrary = fc
            .tuple(
                prefixArbitrary,
                restArbitrary,
                containedArbitrary,
                fc.nat({ max: prefix.length }),
                fc.nat()
            )
            .map(([first, rest, held, cut, rotation]) => {
                const tail = [...rest, ...held];
                // Prefix items may stop short, down to `minItems`, but not with anything after them
                const head = tail.length > 0 ? first : first.slice(0, Math.max(cut, minItems));
                const offset = tail.length > 0 ? rotation % tail.length : 0;
                return [...head, ...tail.slice(offset), ...tail.slice(0, offset)].slice(
                    0,
                    maxItems
                );
            });

        return {
            arbitrary,
            exact:
                maxContains === Number.POSITIVE_INFINITY &&
                contains.length <= 1 &&
                (!uniqueItems || (!contained && prefix.length === 0)),
            recursive:
                prefix.some(built => built.recursive) ||
                (items?.recursive ?? false) ||
                (contained?.recursive ?? false),
        };
    }

    #buildObject(branch: Branch, path: string): BuiltType | null {
        const { maxProperties, minProperties, patternProperties, propertyNames, required } = branch;
        if (minProperties > maxProperties) {
            return null;
        }
        const additional = branch.additionalProperties;
        const patterns = patternProperties
            .keys()
            .map(pattern => new RegExp(pattern, 'u'))
            .toArray();

        type Entry = readonly [string, unknown];
        const toEntries = (dictionary: Record<string, unknown>): readonly Entry[] =>
            Object.entries(dictionary);

        const entries: fc.Arbitrary<Entry | typeof absent>[] = [];
        const known = new Set<string>();
        let isRecursive = false;
        let optionalCount = 0;

        const keys = new Set([...branch.properties.keys(), ...required]);
        for (const key of keys) {
            known.add(key);
            const declared = branch.properties.get(key);
            const isCovered = isCoveredByPattern(patterns, key);
            const nodes = declared ?? (isCovered ? [] : additional);
            const built = this.#combined(nodes, `${path}/properties/${key}`);
            if (required.has(key)) {
                if (!built) {
                    return null;
                }
                isRecursive ||= built.recursive;
                entries.push(built.arbitrary.map(value => [key, value] as const));
            } else if (built) {
                isRecursive ||= built.recursive;
                optionalCount++;
                entries.push(
                    fc.option(
                        built.arbitrary.map(value => [key, value] as const),
                        { maxDepth, depthIdentifier: this.#depthIdentifier, nil: absent }
                    )
                );
            }
        }

        const isOpen = additional.length === 0;
        const additionalBuilt = this.#combined(additional, `${path}/additionalProperties`);
        const dictionaries: fc.Arbitrary<readonly Entry[]>[] = [];
        const requiredCount = required.size;
        const roomForExtras = maxProperties - requiredCount;
        const neededExtras = Math.max(0, minProperties - requiredCount - optionalCount);

        // Only strings can be keys, whatever `propertyNames` leaves open
        const keyNodes = this.#combined(
            [{ type: 'string' }, ...propertyNames],
            `${path}/propertyNames`
        );
        if (additionalBuilt && keyNodes) {
            isRecursive ||= additionalBuilt.recursive;
            const dictionaryKey = filtered(
                keyNodes.arbitrary as fc.Arbitrary<string>,
                key => !known.has(key) && !isCoveredByPattern(patterns, key),
                `${path}/propertyNames`
            );
            const maxKeys = Math.max(
                0,
                Math.min(
                    roomForExtras,
                    isOpen ? Math.max(maxOpenProperties, neededExtras) : Number.POSITIVE_INFINITY
                )
            );
            const dictionary = (limit: number): fc.Arbitrary<readonly Entry[]> =>
                fc
                    .dictionary(dictionaryKey, additionalBuilt.arbitrary, {
                        depthIdentifier: this.#depthIdentifier,
                        minKeys: neededExtras,
                        noNullPrototype: true,
                        ...(limit < Number.POSITIVE_INFINITY && { maxKeys: limit }),
                    })
                    .map(toEntries);
            dictionaries.push(
                additionalBuilt.recursive
                    ? this.#limitDepth(dictionary(neededExtras), dictionary(maxKeys))
                    : dictionary(maxKeys)
            );
        }

        const maxPatternKeys = Math.max(0, Math.min(maxOpenProperties, roomForExtras));
        for (const [pattern, nodes] of patternProperties) {
            const built = this.#combined(nodes, `${path}/patternProperties/${pattern}`);
            const patternKeys = stringsMatching(pattern);
            if (!built || !patternKeys) {
                continue;
            }
            isRecursive ||= built.recursive;
            const dictionary = (limit: number): fc.Arbitrary<readonly Entry[]> =>
                fc
                    .dictionary(patternKeys, built.arbitrary, {
                        depthIdentifier: this.#depthIdentifier,
                        maxKeys: limit,
                        noNullPrototype: true,
                    })
                    .map(toEntries);
            dictionaries.push(
                built.recursive
                    ? this.#limitDepth(dictionary(0), dictionary(maxPatternKeys))
                    : dictionary(maxPatternKeys)
            );
        }

        return {
            arbitrary: fc
                .tuple(fc.tuple(...entries), fc.tuple(...dictionaries))
                .map(([declared, extras]) => {
                    const present = declared.filter((entry): entry is Entry => entry !== absent);
                    // Declared last, since a declared property wins over a pattern matching its key
                    return Object.fromEntries([...extras.flat(), ...present]);
                }),
            exact:
                patternProperties.size === 0 &&
                propertyNames.length <= 1 &&
                (minProperties <= requiredCount || additionalBuilt !== null) &&
                (maxProperties === Number.POSITIVE_INFINITY ||
                    maxProperties >= requiredCount + optionalCount + maxOpenProperties),
            recursive: isRecursive,
        };
    }
}

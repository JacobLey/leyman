import type { JsonSchema } from './types.js';

// Draft 2020-12 keywords whose values hold subschemas, as one subschema, a list, or a map
const subschemaKeywords = new Set([
    'additionalProperties',
    'contains',
    'else',
    'if',
    'items',
    'not',
    'propertyNames',
    'then',
    'unevaluatedItems',
    'unevaluatedProperties',
]);
const subschemaListKeywords = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
const subschemaMapKeywords = new Set([
    '$defs',
    'dependentSchemas',
    'patternProperties',
    'properties',
]);

/**
 * Keywords with no draft-07 form.
 */
const unsupportedKeywords = new Set([
    '$anchor',
    '$dynamicAnchor',
    '$dynamicRef',
    '$recursiveAnchor',
    '$recursiveRef',
    '$vocabulary',
]);

/**
 * Keywords that may sit next to a draft-07 `$ref`, which ignores its siblings, without changing what it accepts.
 */
const refSiblingKeywords = new Set([
    '$comment',
    '$schema',
    'default',
    'definitions',
    'deprecated',
    'description',
    'examples',
    'readOnly',
    'title',
    'writeOnly',
]);

/**
 * Keywords that evaluate properties or items of the instance they apply to, which `unevaluated*` keywords take into
 * account. `not` is left out: its annotations are always dropped.
 */
const inPlaceApplicators = ['$ref', 'allOf', 'anyOf', 'dependentSchemas', 'if', 'oneOf'];

/**
 * Error for a keyword (or keyword value) that draft-07 can't express.
 *
 * @param keyword - JSON Schema keyword
 * @returns error to throw
 */
const unsupported = (keyword: string): Error =>
    new Error(`JSON Schema target: "draft-07" does not support "${keyword}" here`);

/**
 * Point a local `$ref` at `definitions` rather than `$defs`. Only segments in keyword position are renamed, not a
 * property that happens to be named `$defs`.
 *
 * @param ref - `$ref` value
 * @returns `$ref` value for draft-07
 */
const convertRef = (ref: unknown): unknown => {
    if (typeof ref !== 'string' || !ref.startsWith('#/')) {
        return ref;
    }
    let isKeyword = true;
    const segments = ref
        .slice('#/'.length)
        .split('/')
        .map(segment => {
            if (!isKeyword) {
                isKeyword = true;
                return segment;
            }
            // The next segment names a subschema of a map, or indexes a list
            isKeyword = !subschemaMapKeywords.has(segment) && !subschemaListKeywords.has(segment);
            return segment === '$defs' ? 'definitions' : segment;
        });
    return `#/${segments.join('/')}`;
};

/**
 * Whether `unevaluatedProperties`/`unevaluatedItems`, which draft-07 lacks, is kept as `additionalProperties`/
 * `additionalItems` (or `items`). That is only exact when nothing else in the schema evaluates properties (or items).
 *
 * @param input - draft 2020-12 schema
 * @param unevaluated - draft-07 value of `unevaluatedKeyword`
 * @param unevaluatedKeyword - `unevaluatedProperties` or `unevaluatedItems`
 * @param additionalKeyword - draft 2020-12 keyword that evaluates every remaining property (or item)
 * @param otherEvaluators - other keywords of `input` that evaluate properties (or items)
 * @returns whether to keep it, under the draft-07 keyword
 * @throws {Error} when other keywords evaluate properties (or items)
 */
const shouldKeepUnevaluated = (
    input: Record<string, unknown>,
    unevaluated: unknown,
    unevaluatedKeyword: string,
    additionalKeyword: string,
    otherEvaluators: readonly string[]
): boolean => {
    // Absent, allows everything, or every property (item) is evaluated already
    if (
        unevaluated === undefined ||
        unevaluated === true ||
        Object.hasOwn(input, additionalKeyword)
    ) {
        return false;
    }
    if (otherEvaluators.some(keyword => Object.hasOwn(input, keyword))) {
        throw unsupported(unevaluatedKeyword);
    }
    return true;
};

/**
 * Convert a draft 2020-12 schema (and its subschemas) to draft-07.
 *
 * @param schema - draft 2020-12 schema
 * @returns draft-07 schema
 * @throws {Error} when the schema uses a keyword draft-07 can't express
 */
const convert = (schema: unknown): unknown => {
    // Boolean schemas
    if (typeof schema !== 'object' || schema === null) {
        return schema;
    }
    const input = schema as Record<string, unknown>;
    let output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
        if (unsupportedKeywords.has(key)) {
            throw unsupported(key);
        }
        if (subschemaKeywords.has(key)) {
            output[key] = convert(value);
        } else if (subschemaListKeywords.has(key)) {
            output[key] = (value as unknown[]).map(subschema => convert(subschema));
        } else if (subschemaMapKeywords.has(key)) {
            output[key] = Object.fromEntries(
                Object.entries(value as object).map(([name, subschema]) => [
                    name,
                    convert(subschema),
                ])
            );
        } else if (key === '$ref') {
            output[key] = convertRef(value);
        } else {
            output[key] = value;
        }
    }

    if (Object.hasOwn(output, '$defs')) {
        output.definitions = output.$defs;
        delete output.$defs;
    }
    if (Object.hasOwn(output, '$schema')) {
        output.$schema = 'https://json-schema.org/draft-07/schema#';
    }

    // Unevaluated keywords are checked against the 2020-12 keywords, so before those are renamed
    const { unevaluatedItems, unevaluatedProperties } = output;
    delete output.unevaluatedItems;
    delete output.unevaluatedProperties;
    if (
        shouldKeepUnevaluated(
            input,
            unevaluatedProperties,
            'unevaluatedProperties',
            'additionalProperties',
            inPlaceApplicators
        )
    ) {
        output.additionalProperties = unevaluatedProperties;
    }
    if (
        shouldKeepUnevaluated(input, unevaluatedItems, 'unevaluatedItems', 'items', [
            ...inPlaceApplicators,
            'contains',
        ])
    ) {
        output[Object.hasOwn(input, 'prefixItems') ? 'additionalItems' : 'items'] =
            unevaluatedItems;
    }

    // `items` applies to the items after `prefixItems`, which draft-07 calls `additionalItems`
    if (Object.hasOwn(output, 'prefixItems')) {
        if (Object.hasOwn(output, 'items')) {
            output.additionalItems = output.items;
        }
        output.items = output.prefixItems;
        delete output.prefixItems;
    }

    if (Object.hasOwn(output, 'contains')) {
        const { maxContains, minContains = 1 } = output;
        delete output.maxContains;
        delete output.minContains;
        if (maxContains !== undefined || (minContains as number) > 1) {
            throw unsupported(maxContains === undefined ? 'minContains' : 'maxContains');
        }
        // Any array contains zero matching items
        if (minContains === 0) {
            delete output.contains;
        }
    }

    const { dependentRequired, dependentSchemas } = output as {
        dependentRequired?: Record<string, string[]>;
        dependentSchemas?: Record<string, unknown>;
    };
    if (dependentRequired || dependentSchemas) {
        const dependencies: Record<string, unknown> = { ...dependentRequired };
        if (dependentSchemas !== undefined) {
            for (const [key, dependent] of Object.entries(dependentSchemas)) {
                dependencies[key] = Object.hasOwn(dependencies, key)
                    ? { allOf: [{ required: dependencies[key] }, dependent] }
                    : dependent;
            }
        }
        delete output.dependentRequired;
        delete output.dependentSchemas;
        output.dependencies = dependencies;
    }

    // Draft-07 ignores the siblings of `$ref`, so move it into `allOf` beside them
    if (
        Object.hasOwn(output, '$ref') &&
        Object.keys(output).some(key => key !== '$ref' && !refSiblingKeywords.has(key))
    ) {
        const { $ref, allOf = [], ...siblings } = output;
        output = { ...siblings, allOf: [{ $ref }, ...(allOf as unknown[])] };
    }

    return output;
};

/**
 * Convert a draft 2020-12 schema to draft-07, for consumers that request it (see Standard JSON Schema's `target`).
 *
 * Each keyword is converted exactly: `$defs` become `definitions` (and local `$ref`s follow), `prefixItems` the array
 * form of `items`, `dependentRequired` and `dependentSchemas` become `dependencies`, and `$ref` moves into `allOf`
 * when it has siblings that draft-07 would ignore. `unevaluatedProperties`/`unevaluatedItems` become
 * `additionalProperties`/`additionalItems` when nothing else in the schema evaluates properties (or items).
 *
 * @param schema - draft 2020-12 schema, as serialized by Juniper
 * @returns draft-07 schema
 * @throws {Error} when the schema uses a keyword that has no exact draft-07 form, such as `maxContains`
 */
export const toDraft07 = <T>(schema: JsonSchema<T>): JsonSchema<T> =>
    convert(schema) as JsonSchema<T>;

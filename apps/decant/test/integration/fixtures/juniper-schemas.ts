import type { PatternProperties } from 'juniper';
import {
    arraySchema,
    booleanSchema,
    defineRecursive,
    enumSchema,
    mergeSchema,
    neverSchema,
    nullSchema,
    numberSchema,
    objectSchema,
    stringSchema,
    tupleSchema,
} from 'juniper';

/**
 * Juniper schemas whose types decant must generate from their JSON, exactly as Juniper infers them.
 * Each is serialized, read back by decant, and its type compared to Juniper's `SchemaType`.
 */

// Primitives
export const string = stringSchema({ minLength: 1, maxLength: 10, format: 'email' });
export const startsWith = stringSchema().startsWith('usr_');
export const endsWith = stringSchema().endsWith('.json');
export const contains = stringSchema().contains('a-b.c');
export const startsAndEndsWith = stringSchema().startsWith('a').endsWith('z');
export const nullableString = stringSchema().startsWith('a').nullable();
export const number = numberSchema({ minimum: 0, maximum: 10 }).multipleOf(2);
export const integer = numberSchema({ type: 'integer' }).nullable();
export const boolean = booleanSchema();
export const nullValue = nullSchema();
export const never = neverSchema();
export const enumValues = enumSchema().enums(['a', 'b', 1, true, null] as const);
export const singleEnum = enumSchema().enum('only' as const);
export const anything = mergeSchema().description('Anything');

// Arrays
export const array = arraySchema(stringSchema()).minItems(1).uniqueItems(true);
export const nestedArray = arraySchema(arraySchema(numberSchema().nullable()));
export const arrayContains = arraySchema(numberSchema()).contains(numberSchema({ minimum: 5 }));
export const tuple = tupleSchema().prefixItem(stringSchema()).prefixItem(numberSchema());
export const nullableTuple = tupleSchema().prefixItem(booleanSchema()).nullable();

// Objects
const base = objectSchema({
    properties: {
        id: stringSchema(),
        name: stringSchema().nullable(),
        age: numberSchema(),
    },
    required: ['id', 'age'],
    additionalProperties: false,
});
export const object = base;
export const nullableObject = base.nullable();
export const openObject = objectSchema({
    properties: { a: stringSchema() },
    additionalProperties: true,
});
export const recordObject = objectSchema({
    properties: { a: stringSchema() },
    required: ['a'],
    additionalProperties: numberSchema(),
});
export const patternObject = objectSchema({ additionalProperties: false }).patternProperties(
    // Juniper reads the keys a pattern matches from this type, not from the pattern
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    '^x-' as PatternProperties<`x-${string}`>,
    stringSchema()
);
export const picked = base.pick(['id', 'name']);
export const omitted = base.omit(['age']);
export const partial = base.partial();
export const extended = base.extend(
    objectSchema({ properties: { email: stringSchema() }, required: ['email'] })
);
export const dependentRequired = objectSchema({
    properties: { card: stringSchema(), address: stringSchema() },
}).dependentRequired('card', ['address']);
export const dependentSchemas = objectSchema({
    properties: { card: stringSchema(), address: stringSchema() },
}).dependentSchemas(
    'card',
    objectSchema({ properties: { cvv: numberSchema() }, required: ['cvv'] })
);
export const unevaluated = objectSchema({ properties: { a: true } }).unevaluatedProperties(false);
export const annotated = objectSchema({
    title: 'Annotated',
    description: 'An annotated object',
    properties: { old: stringSchema({ deprecated: true, description: 'Use new' }) },
}).metadata('x-internal', true);

// Composition
export const anyOf = mergeSchema().anyOf([stringSchema(), numberSchema()]);
export const oneOf = mergeSchema().oneOf([
    objectSchema({
        properties: { kind: enumSchema().enum('cat' as const), lives: numberSchema() },
        required: ['kind', 'lives'],
    }),
    objectSchema({
        properties: { kind: enumSchema().enum('dog' as const), goodBoy: booleanSchema() },
        required: ['kind', 'goodBoy'],
    }),
]);
export const allOf = mergeSchema()
    .allOf(objectSchema({ properties: { a: stringSchema() }, required: ['a'] }))
    .allOf(objectSchema({ properties: { b: numberSchema() } }));
export const stringAllOf = stringSchema().allOf(stringSchema().startsWith('a'));

export const notNull = stringSchema().nullable().not(nullSchema());
export const mergeNotNull = mergeSchema().anyOf([stringSchema(), nullSchema()]).not(nullSchema());

// Definitions
const address = objectSchema({
    properties: { city: stringSchema(), zip: stringSchema({ pattern: '^[0-9]{5}$' }) },
    required: ['city'],
}).define('Address');
export const definitions = objectSchema({
    properties: { home: address, work: address.nullable(), others: arraySchema(address) },
    required: ['home'],
});
export const describedReference = objectSchema({
    properties: { home: address.description('Where they live') },
});

interface TreeNode {
    value: number;
    children: TreeNode[];
    parent?: TreeNode | null;
}
export const recursive = defineRecursive<TreeNode>('TreeNode', self =>
    objectSchema({
        properties: { value: numberSchema(), children: arraySchema(self), parent: self.nullable() },
        required: ['value', 'children'],
    })
);

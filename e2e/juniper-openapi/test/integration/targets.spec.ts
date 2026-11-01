import type { PatternProperties, Schema } from 'juniper';
import { Ajv } from 'ajv';
import AjvDraft04 from 'ajv-draft-04';
import ajvFormats from 'ajv-formats';
import * as fc from 'fast-check';
import { defaultImport } from 'default-import';
import {
    arraySchema,
    enumSchema,
    mergeSchema,
    numberSchema,
    objectSchema,
    stringSchema,
    tupleSchema,
} from 'juniper';
import { makeArbitrary } from 'juniper-arbitrary';
import { suite, test } from 'mocha-chain';

const addFormats = defaultImport(ajvFormats);
// eslint-disable-next-line @typescript-eslint/naming-convention -- Holds a class, so it is named like one
const Draft04 = defaultImport(AjvDraft04);

const pattern = '^x' as PatternProperties<`x${string}`>;

const options = { numRuns: 100, seed: 42 };

const shared: Readonly<Record<string, Schema<unknown>>> = {
    string: stringSchema().minLength(1).maxLength(9).pattern('^a').format('uuid').nullable(),
    number: numberSchema().minimum(1).exclusiveMaximum(9).multipleOf(2),
    'exclusive minimum': numberSchema().exclusiveMinimum(0),
    enum: enumSchema({ enum: ['a', 1, null] }),
    object: objectSchema({
        properties: { a: stringSchema(), b: numberSchema().nullable() },
        required: ['a'],
    }),
    'pattern properties, closed': objectSchema()
        .patternProperties(pattern, numberSchema())
        .additionalProperties(false),
    'pattern properties, typed additional properties': objectSchema()
        .patternProperties(pattern, numberSchema())
        .additionalProperties(stringSchema()),
    'pattern properties beside properties': objectSchema({
        properties: { a: stringSchema() },
        additionalProperties: false,
    }).patternProperties(pattern, numberSchema()),
    'dependent required': objectSchema()
        .properties({ a: numberSchema(), b: numberSchema() })
        .dependentRequired('a', ['b']),
    array: arraySchema(numberSchema()).minItems(1).maxItems(5).uniqueItems(true),
    'prefix items and rest': arraySchema(stringSchema()).prefixItem(numberSchema()),
    tuple: tupleSchema().prefixItem(numberSchema()).prefixItem(stringSchema()),
    anyOf: mergeSchema().anyOf([numberSchema(), stringSchema()]),
    oneOf: mergeSchema().oneOf([numberSchema().minimum(0), stringSchema()]),
    allOf: mergeSchema().allOf(numberSchema().minimum(1)).allOf(numberSchema().maximum(9)),
    not: numberSchema().not(numberSchema().minimum(9)),
    if: numberSchema().if(numberSchema().minimum(1), {
        // eslint-disable-next-line unicorn/no-thenable -- Juniper's `if` keyword
        then: numberSchema().maximum(9),
    }),
};

// A target can only drop or widen what it lacks, so whatever the original accepts it must accept
const acceptsAllValues = (schema: Schema<unknown>, validate: (value: unknown) => boolean): void => {
    fc.assert(
        fc.property(makeArbitrary(schema), value => validate(value)),
        options
    );
};

suite('Targets accept every value the 2020-12 schema does', () => {
    suite('draft-07', () => {
        for (const [name, schema] of Object.entries(shared)) {
            test(name, () => {
                const draft07 = schema['~standard'].jsonSchema.input({ target: 'draft-07' });
                const validate = addFormats(new Ajv({ logger: false, strict: false })).compile(
                    draft07
                );
                acceptsAllValues(schema, value => validate(value));
            });
        }
    });

    suite('OpenAPI 3.0', () => {
        // Keywords of its own (`nullable`, a boolean `exclusiveMinimum`) are those of JSON Schema draft 4
        const openApi30: Readonly<Record<string, Schema<unknown>>> = {
            ...shared,
            contains: arraySchema(numberSchema()).contains(numberSchema().minimum(9)),
        };
        for (const [name, schema] of Object.entries(openApi30)) {
            test(name, () => {
                const validate = addFormats(new Draft04({ logger: false, strict: false })).compile(
                    schema.toJSON({ openApi30: true })
                );
                acceptsAllValues(schema, value => validate(value));
            });
        }
    });
});

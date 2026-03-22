import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Options as AjvOptions, ErrorObject } from 'ajv/dist/2020.js';
import type { JsonSchema, Schema } from 'juniper';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { isSchema } from 'juniper';

export interface JuniperValidator<T> extends StandardSchemaV1<T> {
    is: (x: unknown) => x is T;
    assert: (x: unknown) => asserts x is T;
    /**
     * Shorthand for StandardSchema
     */
    validate: (value: unknown) => StandardSchemaV1.Result<T>;
}

export const makeValidator = <T>(
    schema: JsonSchema<T> | Schema<T>,
    options?: Omit<AjvOptions, 'strict'>
): JuniperValidator<T> => {
    const json = isSchema(schema) ? schema.toJSON({ schema: true }) : schema;
    const validator = new Ajv2020({ ...options, strict: true }).compile<T>(json);

    const validate = (value: unknown): StandardSchemaV1.Result<T> => {
        if (validator(value)) {
            return {
                value,
            };
        }
        return {
            issues: validator.errors!.filter(
                (issue): issue is ErrorObject & StandardSchemaV1.Issue =>
                    typeof issue.message === 'string'
            ),
        };
    };

    return {
        is: x => validator(x),
        assert: x => {
            if (validator(x)) {
                return;
            }
            throw new Error('Value does not match schema', { cause: validator.errors });
        },
        '~standard': {
            version: 1,
            vendor: 'juniper',
            validate,
        },
        validate,
    };
};

export type ValidatorType<T extends JuniperValidator<unknown>> = T extends {
    is: (x: unknown) => x is infer V;
}
    ? V
    : never;
export type AssertionType<T extends JuniperValidator<unknown>> = T['assert'];

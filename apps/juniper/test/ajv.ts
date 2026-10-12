import type { AnySchema, Options, ValidateFunction } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';

const strictOptions: Options = { strict: true };

/**
 * Compile a JSON schema with a new Ajv instance, so tests never share compiled schemas.
 *
 * @param schema - JSON schema to compile
 * @param options - Ajv options
 * @returns validator for the schema
 */
export const compile = <T = unknown>(
    schema: AnySchema,
    options: Options = strictOptions
): ValidateFunction<T> => {
    const ajv = new Ajv2020(options);
    return ajv.compile<T>(schema);
};

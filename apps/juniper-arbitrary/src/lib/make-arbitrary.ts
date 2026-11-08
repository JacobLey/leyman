import type { ValidateFunction } from 'ajv/dist/2020.js';
import type { Arbitrary } from 'fast-check';
import type { Schema } from 'juniper';
import type { SchemaNode, SchemaObject } from './flatten.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import ajvFormats from 'ajv-formats';
import { defaultImport } from 'default-import';
import { Builder } from './build.js';
import { UnsatisfiableSchemaError, UnsupportedSchemaError } from './errors.js';
import { filtered } from './filtered-arbitrary.js';
import { SchemaIndex } from './refs.js';

const addFormats = defaultImport(ajvFormats);

const rootPath = '#';

/**
 * Whether a schema only refers to the root's `$defs`, which stay reachable when a part of it is
 * validated on its own beside them. Other pointers (`#/properties/a`) only mean something from the
 * root, and an `$id` or anchor changes what a `$ref` resolves against.
 *
 * @param node - schema, or the root's `$defs`
 * @returns if a part can be compiled separately
 */
const hasOnlyDefinitionRefs = (
    node: Readonly<Record<string, SchemaNode>> | SchemaNode
): boolean => {
    const json = JSON.stringify(node);
    return (
        !/"\$(?:anchor|dynamicAnchor|dynamicRef|id)":/v.test(json) &&
        json
            .matchAll(/"\$ref":"(?<ref>[^"]*)"/gv)
            .every(({ groups }) => groups?.ref?.startsWith('#/$defs/') === true)
    );
};

/**
 * Create a fast-check arbitrary of the values a Juniper schema accepts.
 *
 * Generators aim at each keyword, and a validator has the last word, so a value that comes out
 * always validates. A schema that can't be aimed at is slower to generate from, and throws
 * {@link UnsatisfiableSchemaError} while generating if valid values are too hard to find.
 *
 * @param schema - Juniper schema
 * @returns arbitrary of the schema's type
 * @throws {UnsatisfiableSchemaError} when nothing can match the schema
 * @throws {UnsupportedSchemaError} when the schema refers to something it doesn't hold
 */
export const makeArbitrary = <T>(schema: Schema<T>): Arbitrary<T> => {
    // A copy, so each place in it is a distinct object, as `SchemaIndex` expects
    // eslint-disable-next-line unicorn/prefer-structured-clone -- `structuredClone` keeps shared objects shared
    const root = JSON.parse(JSON.stringify(schema.toJSON())) as SchemaObject;

    // Not strict: this checks values, and has no opinion on how a schema is written
    const ajv = addFormats(new Ajv2020({ discriminator: true, logger: false, strict: false }));
    let rootValidator: ValidateFunction;
    try {
        rootValidator = ajv.compile(root);
    } catch (error) {
        throw new UnsupportedSchemaError(
            `Schema does not compile: ${(error as Error).message}`,
            rootPath
        );
    }

    const index = new SchemaIndex(root);
    const areDefinitionsAlone = hasOnlyDefinitionRefs(root.$defs ?? {});
    const builder = new Builder({
        root,
        validatorFor: node => {
            // Without one only the root's check remains, which is enough to be correct.
            // A key unlike its JSON means part of the schema sits inside an `$id`.
            if (
                !areDefinitionsAlone ||
                !hasOnlyDefinitionRefs(node) ||
                index.keyOf(node) !== JSON.stringify(node)
            ) {
                return () => true;
            }
            // Booleans never get here: `true` needs no checking, and `false` generates nothing
            const validate = ajv.compile({ ...(node as SchemaObject), $defs: root.$defs });
            return value => validate(value);
        },
    });

    const arbitrary = builder.build(root, rootPath);
    if (!arbitrary) {
        throw new UnsatisfiableSchemaError('Nothing can match this schema', rootPath);
    }
    return filtered(arbitrary, value => rootValidator(value), rootPath) as Arbitrary<T>;
};

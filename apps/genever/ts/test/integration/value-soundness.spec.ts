import type { Schema } from 'juniper';
import * as fc from 'fast-check';
import { expect } from '@leyman/expect';
import { juniperSchemas as fixtures } from '@leyman/genever-test-vectors';
import { genever } from 'genever';
import { makeArbitrary } from 'juniper-arbitrary';
import { suite, test } from 'mocha-chain';
import { typeCheck } from '../lib/type-check.js';

const assignments = (typeName: string, values: readonly unknown[]): string =>
    values
        .map(
            (value, index) =>
                `export const ${typeName}${index}: ${typeName} = ${JSON.stringify(value)};`
        )
        .join('\n');

/**
 * Diagnostics about the checking of literals rather than what a type accepts:
 *
 * - TS2353: undeclared properties are excess in a literal, but assignable once it isn't one.
 * - `toString`, `valueOf` and the like as undeclared keys collide with `Object`'s methods, in any type.
 *
 * @param diagnostics - formatted diagnostics
 * @returns those saying a type rejects a value
 */
const assignability = (diagnostics: readonly string[]): readonly string[] =>
    diagnostics.filter(
        diagnostic =>
            !diagnostic.includes('TS2353') && !diagnostic.includes("not assignable to type '() =>")
    );

// Nothing to generate
const withoutValues = new Set(['never']);

/**
 * Assign values the schema accepts to both the generated type and Juniper's.
 *
 * @param name - name of the schema exported by the fixtures
 * @returns diagnostics
 */
const typeCheckValues = (name: string): string[] => {
    const schema = fixtures[name as keyof typeof fixtures] as Schema<unknown>;
    // eslint-disable-next-line unicorn/prefer-structured-clone -- Only the serialized text survives, as if read from a file
    const json: unknown = JSON.parse(JSON.stringify(schema.toJSON()));
    const values = fc.sample(makeArbitrary(schema), { numRuns: 25, seed: 42 });

    return typeCheck({
        'generated.ts': genever(json, { strict: false }),
        'values.ts': [
            "import type { SchemaType } from 'juniper';",
            "import type { juniperSchemas as fixtures } from '@leyman/genever-test-vectors';",
            "import type { Schema as Generated } from './generated.js';",
            `type Inferred = SchemaType<typeof fixtures.${name}>;`,
            assignments('Generated', values),
            assignments('Inferred', values),
        ].join('\n'),
    });
};

/**
 * A round trip proves genever's type is the same as Juniper's, not that either is right. Checking
 * values the schema accepts proves neither type is narrower than the schema, which is what a type
 * from non-strict mode promises.
 */
suite('Generated types accept every value the schema accepts', () => {
    const names = Object.keys(fixtures).filter(name => !withoutValues.has(name));
    for (const name of names) {
        test(name, () => {
            expect(assignability(typeCheckValues(name))).to.deep.equal([]);
        });
    }
});

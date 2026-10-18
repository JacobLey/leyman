import type { GeneverOptions } from 'genever';
import { expect } from '@leyman/expect';
import { genever } from 'genever';
import { typeCheck } from './type-check.js';

/**
 * Virtual module declaring `Normalize`, which removes differences between how types are written,
 * but not between what they accept: intersections of objects are flattened, and `Record<K, V>` becomes
 * an index signature. Optional and readonly modifiers are kept.
 *
 * Normalized types are compared by TypeScript's identity check, so e.g. `{ a?: string }` and `{}`
 * are different, though each is assignable to the other.
 */
export const normalizeModule = `export type Normalize<T> = T extends object ? { [K in keyof T]: Normalize<T[K]> } : T;`;

/**
 * Lines asserting the type `actual` is equivalent to `expected`.
 *
 * @param actual - TypeScript source of the type
 * @param expected - TypeScript source of the expected type
 * @returns TypeScript source lines
 */
export const equivalentAssertion = (actual: string, expected: string): string =>
    `expectTypeOf<Normalize<${actual}>>().toEqualTypeOf<Normalize<${expected}>>();`;

const assertionImports = [
    "import { expectTypeOf } from 'expect-type';",
    "import type { Normalize } from './normalize.js';",
];

/**
 * Assert the types of generated TypeScript source are equivalent to the expected types.
 *
 * @param source - generated TypeScript source
 * @param expected - TypeScript source of each expected type, keyed by type name.
 * Expected types may refer to the other generated types by name.
 */
export const expectTypes = (source: string, expected: Readonly<Record<string, string>>): void => {
    const entries = Object.entries(expected);
    const assertion = [
        ...assertionImports,
        `import type { ${entries.map(([name]) => name).join(', ')} } from './generated.js';`,
        ...entries.map(([name, type]) => `type $Expected${name} = ${type};`),
        ...entries.map(([name]) => equivalentAssertion(name, `$Expected${name}`)),
    ].join('\n');

    expect(
        typeCheck({
            'assertion.ts': assertion,
            'generated.ts': source,
            'normalize.ts': normalizeModule,
        }),
        `Generated:\n${source}`
    ).to.deep.equal([]);
};

/**
 * Assert the types generated for a schema are equivalent to the expected types.
 *
 * Compares the types TypeScript reads, never the generated text,
 * so formatting and equivalent ways of writing a type are free to change.
 *
 * @param schema - JSON Schema
 * @param expected - TypeScript source of each expected type, keyed by type name.
 * Expected types may refer to the other generated types by name.
 * @param [options] - genever options
 */
export const expectGenerated = (
    schema: unknown,
    expected: Readonly<Record<string, string>>,
    options: GeneverOptions = {}
): void => {
    expectTypes(genever(schema, options), expected);
};

export { assertionImports };

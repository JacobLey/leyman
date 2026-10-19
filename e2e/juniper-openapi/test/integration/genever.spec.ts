import { expect } from '@leyman/expect';
import { genever } from 'genever';
import { suite, test } from 'mocha-chain';
import { buildSpec } from '../data/api.js';
import { typeCheck } from '../lib/type-check.js';

// Removes differences between how types are written, but not between what they accept
const normalizeModule =
    'export type Normalize<T> = T extends object ? { [K in keyof T]: Normalize<T[K]> } : T;';

// Each component genever generates, and the type juniper inferred for its schema
const expected = {
    Comment: 'api.Comment',
    Error: 'SchemaType<typeof api.errorSchema>',
    NewPost: 'api.NewPost',
    NewUser: 'api.NewUser',
    Post: 'api.Post',
    PostPage: 'api.PostPage',
    User: 'api.User',
    UserUpdate: 'api.UserUpdate',
};

suite('genever reads the spec back', () => {
    for (const version of ['3.0.3', '3.1.0'] as const) {
        test(`OpenAPI ${version} gives the types juniper inferred`, () => {
            // Only the serialized text survives, as if read from a file
            // eslint-disable-next-line unicorn/prefer-structured-clone
            const source = genever(JSON.parse(JSON.stringify(buildSpec(version))));
            const names = Object.keys(expected);
            const assertion = [
                "import { expectTypeOf } from 'expect-type';",
                "import type { SchemaType } from 'juniper';",
                "import type * as api from '../data/api.js';",
                `import type { ${names.join(', ')} } from './generated.js';`,
                "import type { Normalize } from './normalize.js';",
                ...Object.entries(expected).map(
                    ([name, type]) =>
                        `expectTypeOf<Normalize<${name}>>().toEqualTypeOf<Normalize<${type}>>();`
                ),
            ].join('\n');

            expect(
                typeCheck({
                    'assertion.ts': assertion,
                    'generated.ts': source,
                    'normalize.ts': normalizeModule,
                }),
                `Generated:\n${source}`
            ).to.deep.equal([]);
        });
    }
});

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

// Operation types, against the schemas the spec was built with
const json = '["content"]["application/json"]';
// An OpenAPI path template, not a JavaScript one
const userGet = 'G.Paths["/users/{userId}"]["get"]';
const operations = {
    [`${userGet}["responses"][200]${json}`]: 'api.User',
    [`${userGet}["parameters"]["path"]`]: '{ userId: string }',
    [`G.Operations["createUser"]["requestBody"]${json}`]: 'api.NewUser',
    [`G.Operations["updateUser"]["responses"][404]${json}`]: 'SchemaType<typeof api.errorSchema>',
    [`G.Operations["listUserPosts"]["parameters"]["query"]`]:
        '{ cursor?: string; limit?: number } | undefined',
    [`G.Operations["listPostComments"]["responses"][200]${json}`]: 'api.Comment[]',
};

suite('genever reads the spec back', () => {
    for (const version of ['3.0.3', '3.1.0'] as const) {
        test(`OpenAPI ${version} gives the types juniper inferred`, () => {
            // eslint-disable-next-line unicorn/prefer-structured-clone -- Only the serialized text survives, as if read from a file
            const source = genever(JSON.parse(JSON.stringify(buildSpec(version))));
            const names = Object.keys(expected);
            const assertion = [
                "import { expectTypeOf } from 'expect-type';",
                "import type { SchemaType } from 'juniper';",
                "import type * as api from '../data/api.js';",
                `import type { ${names.join(', ')} } from './generated.js';`,
                "import type { Normalize } from './normalize.js';",
                "import type * as G from './generated.js';",
                ...Object.entries({ ...expected, ...operations }).map(
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

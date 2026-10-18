import Path from 'node:path';
import { expect } from '@leyman/expect';
import { decantFile } from 'decant';
import { beforeEach, suite } from 'mocha-chain';
import { normalizeModule } from '../lib/expect-decanted.js';
import { typeCheck } from '../lib/type-check.js';
import { createTmpDir, userSchema } from './lib/fixtures.js';

suite('decantFile', () => {
    const withTmpDir = beforeEach(createTmpDir);
    withTmpDir.afterEach(async ctx => {
        await ctx.tmpDir.cleanup();
    });

    withTmpDir.test('writes formatted types that compile', async ctx => {
        await ctx.writeJson('user.json', userSchema);

        const result = await decantFile(ctx.resolve('user.json'));

        expect(result).to.deep.equal({ output: ctx.resolve('user.ts'), updated: true });
        expect(
            typeCheck({
                'normalize.ts': normalizeModule,
                'decanted.ts': await ctx.read('user.ts'),
                'assertion.ts': [
                    "import { expectTypeOf } from 'expect-type';",
                    "import type { Normalize } from './normalize.js';",
                    "import type { Schema } from './decanted.js';",
                    'expectTypeOf<Normalize<Schema>>().toEqualTypeOf<Normalize<{ name: string; tags?: string[] }>>();',
                ].join('\n'),
            })
        ).to.deep.equal([]);
    });

    withTmpDir.test('resolves paths from cwd', async ctx => {
        await ctx.writeJson('user.json', userSchema);

        const result = await decantFile('user.json', { cwd: ctx.tmpDir.path, output: 'out.ts' });

        expect(result.output).to.equal(Path.join(ctx.tmpDir.path, 'out.ts'));
    });

    withTmpDir.test('is not updated when up to date', async ctx => {
        await ctx.writeJson('user.json', userSchema);
        await decantFile(ctx.resolve('user.json'));

        const result = await decantFile(ctx.resolve('user.json'));

        expect(result.updated).to.equal(false);
    });

    withTmpDir.test('check fails when out of date', async ctx => {
        await ctx.writeJson('user.json', userSchema);

        await expect(decantFile(ctx.resolve('user.json'), { check: true })).to.be.rejectedWith(
            Error
        );
    });
});

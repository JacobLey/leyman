import { chmod } from 'node:fs/promises';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import { TrustedTscError } from '#internal/lib/error.js';
import { findTsc } from '#internal/lib/tsc.js';
import { createFixture } from '../../lib/fixture.js';

const platform = `@typescript/typescript-${process.platform}-${process.arch}`;

suite('findTsc', () => {
    const withFixture = beforeEach(createFixture);
    withFixture.afterEach(async ({ fixture }) => {
        await fixture.tmpDir.cleanup();
    });

    withFixture.test(
        'finds the executable of a dependency that is TypeScript 7.1',
        async ({ fixture }) => {
            await fixture.write({
                'package.json': {
                    dependencies: { 'not-installed': '1', other: '1' },
                    devDependencies: {
                        typescript: '7.0',
                        unversioned: '1',
                        ts: 'npm:typescript@7.1',
                    },
                },
                'node_modules/other/package.json': { name: 'other', version: '9.9.9' },
                'node_modules/typescript/package.json': { name: 'typescript', version: '7.0.2' },
                'node_modules/unversioned/package.json': { name: 'typescript' },
                'node_modules/ts/package.json': { name: 'typescript', version: '7.1.0-beta' },
                [`node_modules/${platform}/package.json`]: {},
                [`node_modules/${platform}/lib/tsc`]: '',
                'src/tsconfig.json': {},
            });
            await chmod(fixture.path(`node_modules/${platform}/lib/tsc`), 0o755);

            expect(await findTsc(fixture.path('src'))).to.equal(
                fixture.path(`node_modules/${platform}/lib/tsc`)
            );
        }
    );

    withFixture.test('accepts later majors', async ({ fixture }) => {
        await fixture.write({
            'package.json': { devDependencies: { typescript: '8' } },
            'node_modules/typescript/package.json': { name: 'typescript', version: '8.0.0' },
            [`node_modules/${platform}/lib/tsc`]: '',
            [`node_modules/${platform}/package.json`]: {},
        });

        expect(await findTsc(fixture.tmpDir.path)).to.equal(
            fixture.path(`node_modules/${platform}/lib/tsc`)
        );
    });

    withFixture.test('fails without the platform executable', async ({ fixture }) => {
        await fixture.write({
            'package.json': { devDependencies: { typescript: '7.1' } },
            'node_modules/typescript/package.json': { name: 'typescript', version: '7.1.0' },
        });
        await expect(findTsc(fixture.tmpDir.path)).to.be.rejectedWith(
            TrustedTscError,
            `TypeScript 7.1.0's executable isn't installed (${platform}).`
        );

        await fixture.write({ [`node_modules/${platform}/package.json`]: {} });
        await expect(findTsc(fixture.tmpDir.path)).to.be.rejectedWith(
            TrustedTscError,
            `TypeScript 7.1.0's executable isn't installed (${platform}).`
        );
    });

    withFixture.test('fails without TypeScript 7.1', async ({ fixture }) => {
        await expect(findTsc(fixture.tmpDir.path)).to.be.rejectedWith(
            TrustedTscError,
            `TypeScript 7.1 or later isn't a dependency of the package of ${fixture.tmpDir.path}.`
        );
    });
});

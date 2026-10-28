import { realpath } from 'node:fs/promises';
import { expect } from '@leyman/expect';
import { beforeEach, suite, test } from 'mocha-chain';
import { findManifest, findPackage, readGrants } from '#internal/lib/packages.js';
import { createFixture } from '../../lib/fixture.js';

suite('packages', () => {
    const withFixture = beforeEach(createFixture);
    withFixture.afterEach(async ({ fixture }) => {
        await fixture.tmpDir.cleanup();
    });

    withFixture.test('findPackage looks in node_modules, up to the root', async ({ fixture }) => {
        await fixture.write({
            'node_modules/@scope/a/package.json': {},
            'project/src/index.ts': '',
        });

        expect(await findPackage(fixture.path('project/src'), '@scope/a')).to.equal(
            fixture.path('node_modules/@scope/a')
        );
        expect(await findPackage(fixture.path('project/src'), 'trusted-tsc-missing')).to.equal(
            null
        );
    });

    withFixture.test('findManifest finds the nearest package.json', async ({ fixture }) => {
        await fixture.write({ 'project/package.json': {}, 'project/src/index.ts': '' });

        expect(await findManifest(fixture.path('project/src'))).to.equal(fixture.path('project'));
    });

    test('findManifest is null without a package.json', async () => {
        expect(await findManifest('/')).to.equal(null);
    });

    withFixture.test(
        'readGrants covers a package, its dependencies, and the directories of their links',
        async ({ fixture }) => {
            // Laid out as pnpm does: every package in a store, linked beside its dependencies
            await fixture.write({
                'store/mapper/node_modules/mapper/package.json': {
                    dependencies: { dep: '1' },
                    optionalDependencies: { 'trusted-tsc-missing': '1' },
                    peerDependencies: { '@scope/peer': '1' },
                },
                'store/dep/node_modules/dep/package.json': { dependencies: { mapper: '1' } },
                'store/peer/node_modules/@scope/peer/package.json': {},
                'hoisted/node_modules/plain/package.json': {},
            });
            await fixture.link('store/dep/node_modules/dep', 'store/mapper/node_modules/dep');
            await fixture.link(
                'store/peer/node_modules/@scope/peer',
                'store/mapper/node_modules/@scope/peer'
            );
            await fixture.link('store/mapper/node_modules/mapper', 'store/dep/node_modules/mapper');
            await fixture.link('store/mapper/node_modules/mapper', 'project/node_modules/mapper');
            const root = await realpath(fixture.tmpDir.path);

            expect(
                [...(await readGrants(fixture.path('project/node_modules/mapper')))].toSorted(
                    (a, b) => a.localeCompare(b)
                )
            ).to.deep.equal(
                [
                    'store/dep/node_modules',
                    'store/dep/node_modules/dep',
                    'store/mapper/node_modules',
                    'store/mapper/node_modules/@scope',
                    'store/mapper/node_modules/mapper',
                    'store/peer/node_modules/@scope/peer',
                ].map(path => `${root}/${path}`)
            );
            expect([
                ...(await readGrants(fixture.path('hoisted/node_modules/plain'))),
            ]).to.deep.equal([`${root}/hoisted/node_modules/plain`]);
        }
    );
});

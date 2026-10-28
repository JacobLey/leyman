import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import { readContentMappers } from '#internal/lib/config.js';
import { TrustedTscError } from '#internal/lib/error.js';
import { createFixture } from '../../lib/fixture.js';

const mappers = (name: string): object[] => [{ package: name, extensions: ['.x'] }];

suite('readContentMappers', () => {
    const withFixture = beforeEach(createFixture);
    withFixture.afterEach(async ({ fixture }) => {
        await fixture.tmpDir.cleanup();
    });

    withFixture.test('reads the tsconfig own list', async ({ fixture }) => {
        await fixture.write({
            'tsconfig.json': `{ "contentMappers": ${JSON.stringify(mappers('own'))}, /* comment */ }`,
        });

        expect(await readContentMappers(fixture.path('tsconfig.json'))).to.deep.equal(
            mappers('own')
        );
    });

    withFixture.test('is undefined when no config has a list', async ({ fixture }) => {
        await fixture.write({
            'tsconfig.json': { extends: './base.json' },
            'base.json': { compilerOptions: {} },
        });

        expect(await readContentMappers(fixture.path('tsconfig.json'))).to.equal(undefined);
    });

    withFixture.test('inherits through extends, as TypeScript resolves it', async ({ fixture }) => {
        await fixture.write({
            'tsconfig.json': { extends: './a' },
            'a.json': { extends: './sub/../b' },
            'b.json': { extends: './c' },
            c: { contentMappers: mappers('c') },
        });

        expect(await readContentMappers(fixture.path('tsconfig.json'))).to.deep.equal(mappers('c'));
    });

    withFixture.test('a tsconfig own list replaces an inherited one', async ({ fixture }) => {
        await fixture.write({
            'tsconfig.json': { extends: './base.json', contentMappers: [] },
            'base.json': { contentMappers: mappers('base') },
        });

        expect(await readContentMappers(fixture.path('tsconfig.json'))).to.deep.equal([]);
    });

    withFixture.test('the last extended config with a list wins', async ({ fixture }) => {
        await fixture.write({
            'tsconfig.json': { extends: ['./a.json', './b.json', './c.json'] },
            'a.json': { contentMappers: mappers('a') },
            'b.json': { contentMappers: mappers('b') },
            'c.json': {},
        });

        expect(await readContentMappers(fixture.path('tsconfig.json'))).to.deep.equal(mappers('b'));
    });

    withFixture.test('extends a package', async ({ fixture }) => {
        await fixture.write({
            'project/tsconfig.json': {
                extends: ['base', '@scope/configs/strict', '@scope/configs/loose.json'],
            },
            'node_modules/base/package.json': { name: 'base' },
            'node_modules/base/tsconfig.json': { contentMappers: mappers('base') },
            'node_modules/@scope/configs/package.json': { name: '@scope/configs' },
            'node_modules/@scope/configs/strict.json': { contentMappers: mappers('strict') },
            'node_modules/@scope/configs/loose.json': {},
        });
        expect(await readContentMappers(fixture.path('project/tsconfig.json'))).to.deep.equal(
            mappers('strict')
        );

        await fixture.write({
            'node_modules/@scope/configs/loose.json': { contentMappers: mappers('loose') },
        });
        expect(await readContentMappers(fixture.path('project/tsconfig.json'))).to.deep.equal(
            mappers('loose')
        );
    });

    withFixture.test('fails for a package that is not installed', async ({ fixture }) => {
        await fixture.write({ 'tsconfig.json': { extends: 'trusted-tsc-missing/base' } });

        await expect(readContentMappers(fixture.path('tsconfig.json'))).to.be.rejectedWith(
            TrustedTscError,
            `Can't find 'trusted-tsc-missing/base', which ${fixture.path('tsconfig.json')} extends.`
        );
    });

    withFixture.test('fails for a tsconfig that extends itself', async ({ fixture }) => {
        await fixture.write({
            'tsconfig.json': { extends: './base.json' },
            'base.json': { extends: './tsconfig.json' },
        });

        await expect(readContentMappers(fixture.path('tsconfig.json'))).to.be.rejectedWith(
            TrustedTscError,
            `${fixture.path('tsconfig.json')} extends itself.`
        );
    });

    withFixture.test('fails for a tsconfig it cannot read', async ({ fixture }) => {
        await fixture.write({ 'tsconfig.json': '{ "a": ' });

        await expect(readContentMappers(fixture.path('tsconfig.json'))).to.be.rejectedWith(
            TrustedTscError,
            `Can't read ${fixture.path('tsconfig.json')}: `
        );
        await expect(readContentMappers(fixture.path('missing.json'))).to.be.rejectedWith(
            TrustedTscError,
            `Can't read ${fixture.path('missing.json')}: ENOENT`
        );
    });
});

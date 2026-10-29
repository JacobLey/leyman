import { realpath, rm } from 'node:fs/promises';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import { TrustedTscError } from '#internal/lib/error.js';
import { planTsc } from '#internal/lib/plan.js';
import { createFixture } from '../../lib/fixture.js';

const mapper = (exec: unknown = ['node', 'bin.mjs']): object => ({
    name: 'mapper',
    version: '1.2.3',
    typescript: { contentMapper: { exec } },
});

const withProject = beforeEach(createFixture).beforeEach(async ({ fixture }) => {
    await fixture.write({
        'package.json': { trustedContentMappers: ['mapper'] },
        'tsconfig.json': { contentMappers: [{ package: 'mapper', extensions: ['.x'] }] },
        'node_modules/mapper/package.json': mapper(),
    });
});
withProject.afterEach(async ({ fixture }) => {
    await fixture.tmpDir.cleanup();
});

suite('planTsc', () => {
    withProject.test('runs trusted mappers in the sandbox', async ({ fixture }) => {
        const root = await realpath(fixture.tmpDir.path);

        expect(
            await planTsc(['--noEmit'], fixture.tmpDir.path, {
                HOME: '/home',
                PATH: '/bin',
                TOKEN: 'secret',
                NO_COLOR: undefined,
            })
        ).to.deep.equal({
            configFile: fixture.path('tsconfig.json'),
            args: ['--noEmit', '--runExternalCode'],
            env: {
                PATH: '/bin',
                NODE_OPTIONS: `--permission --allow-fs-read="${root}/node_modules/mapper"`,
            },
            mappers: [
                {
                    name: 'mapper',
                    version: '1.2.3',
                    directory: fixture.path('node_modules/mapper'),
                },
            ],
        });
    });

    withProject.test('keeps other NODE_OPTIONS', async ({ fixture }) => {
        // Without a version
        await fixture.write({
            'node_modules/mapper/package.json': {
                typescript: { contentMapper: { exec: ['node', 'x'] } },
            },
        });
        const plan = await planTsc([], fixture.tmpDir.path, {
            NODE_OPTIONS: '--max-old-space-size=100',
        });

        expect(plan.env.NODE_OPTIONS).to.match(
            /^--max-old-space-size=100 --permission --allow-fs-read=/v
        );
        expect(plan.mappers).to.deep.equal([
            { name: 'mapper', version: '', directory: fixture.path('node_modules/mapper') },
        ]);
    });

    withProject.test('keeps the whole environment without mappers', async ({ fixture }) => {
        await fixture.write({ 'tsconfig.json': {} });

        const { env } = await planTsc([], fixture.tmpDir.path, { TOKEN: 'secret' });
        expect(env).to.deep.equal({ TOKEN: 'secret' });
    });

    withProject.test('finds the tsconfig of -p and --project', async ({ fixture }) => {
        await fixture.write({ 'test/tsconfig.json': {}, 'other.json': { contentMappers: [] } });

        expect(await planTsc(['-p', 'test'], fixture.tmpDir.path, {})).to.deep.equal({
            configFile: fixture.path('test/tsconfig.json'),
            args: ['-p', 'test'],
            env: {},
            mappers: [],
        });
        const { configFile } = await planTsc(['--project', 'other.json'], fixture.tmpDir.path, {});
        expect(configFile).to.equal(fixture.path('other.json'));
    });

    withProject.test('refuses arguments it would not pass on', async ({ fixture }) => {
        await expect(planTsc(['--runexternalcode'], fixture.tmpDir.path, {})).to.be.rejectedWith(
            TrustedTscError,
            'Pass trusted content mappers in package.json, not --runExternalCode.'
        );
        for (const build of ['-b', '--build']) {
            await expect(planTsc([build], fixture.tmpDir.path, {})).to.be.rejectedWith(
                TrustedTscError,
                "--build isn't supported"
            );
        }
        await expect(planTsc(['-p'], fixture.tmpDir.path, {})).to.be.rejectedWith(
            TrustedTscError,
            '-p needs a path.'
        );
        await expect(planTsc(['-p', 'missing'], fixture.tmpDir.path, {})).to.be.rejectedWith(
            TrustedTscError,
            `There is no tsconfig at ${fixture.path('missing')}.`
        );
    });

    withProject.test('refuses a malformed contentMappers', async ({ fixture }) => {
        await fixture.write({ 'tsconfig.json': { contentMappers: {} } });
        await expect(planTsc([], fixture.tmpDir.path, {})).to.be.rejectedWith(
            TrustedTscError,
            `contentMappers in ${fixture.path('tsconfig.json')} must be an array.`
        );

        for (const entry of [null, { extensions: ['.x'] }]) {
            await fixture.write({ 'tsconfig.json': { contentMappers: [entry] } });
            await expect(planTsc([], fixture.tmpDir.path, {})).to.be.rejectedWith(
                TrustedTscError,
                `Each of contentMappers in ${fixture.path('tsconfig.json')} needs a package.`
            );
        }
    });

    withProject.test('refuses a mapper that is not trusted', async ({ fixture }) => {
        const untrusted = `Content mapper 'mapper' isn't trusted: add it to trustedContentMappers in the package.json of ${fixture.tmpDir.path}.`;
        await fixture.write({ 'package.json': { trustedContentMappers: ['other'] } });
        await expect(planTsc([], fixture.tmpDir.path, {})).to.be.rejectedWith(
            TrustedTscError,
            untrusted
        );

        await fixture.write({ 'package.json': {} });
        await expect(planTsc([], fixture.tmpDir.path, {})).to.be.rejectedWith(
            TrustedTscError,
            untrusted
        );
    });

    withProject.test('refuses a project without a package.json', async ({ fixture }) => {
        await fixture.write({
            'project/tsconfig.json': { contentMappers: [{ package: 'mapper' }] },
        });
        await rm(fixture.path('package.json'));

        await expect(planTsc(['-p', 'project'], fixture.tmpDir.path, {})).to.be.rejectedWith(
            TrustedTscError,
            "Content mapper 'mapper' isn't trusted"
        );
    });

    withProject.test('refuses a malformed trustedContentMappers', async ({ fixture }) => {
        for (const trustedContentMappers of ['mapper', ['mapper', 1]]) {
            await fixture.write({ 'package.json': { trustedContentMappers } });
            await expect(planTsc([], fixture.tmpDir.path, {})).to.be.rejectedWith(
                TrustedTscError,
                `trustedContentMappers in ${fixture.path('package.json')} must be an array of package names.`
            );
        }
    });

    withProject.test('refuses a mapper that is not installed', async ({ fixture }) => {
        await fixture.write({ 'tsconfig.json': { contentMappers: [{ package: 'other' }] } });
        await fixture.write({ 'package.json': { trustedContentMappers: ['other'] } });

        await expect(planTsc([], fixture.tmpDir.path, {})).to.be.rejectedWith(
            TrustedTscError,
            "Content mapper 'other' isn't installed."
        );
    });

    withProject.test('refuses a mapper Node does not run', async ({ fixture }) => {
        for (const exec of [null, 'node bin.mjs', ['deno', 'bin.ts']]) {
            await fixture.write({ 'node_modules/mapper/package.json': mapper(exec) });
            await expect(planTsc([], fixture.tmpDir.path, {})).to.be.rejectedWith(
                TrustedTscError,
                "Content mapper 'mapper' isn't run by node, so it can't be sandboxed."
            );
        }
    });

    withProject.test('refuses permissions from the mapper or NODE_OPTIONS', async ({ fixture }) => {
        for (const flag of [
            '--allow-fs-read=*',
            '--permission-audit',
            '--experimental-permission',
        ]) {
            await fixture.write({
                'node_modules/mapper/package.json': mapper(['node', flag, 'bin.mjs']),
            });
            await expect(planTsc([], fixture.tmpDir.path, {})).to.be.rejectedWith(
                TrustedTscError,
                "Content mapper 'mapper' sets Node's permissions in its exec, which would replace the sandbox's."
            );
        }

        await fixture.write({ 'node_modules/mapper/package.json': mapper() });
        await expect(
            planTsc([], fixture.tmpDir.path, { NODE_OPTIONS: '--inspect  --allow-child-process' })
        ).to.be.rejectedWith(
            TrustedTscError,
            "NODE_OPTIONS sets Node's permissions, which would replace the sandbox's."
        );
    });
});

import type { FindLockfileDir, ReadLockfile } from '../../../lib/dependencies.js';
import { verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import { PrunedLockfile } from '../../../lib/pruned-lockfile.js';
import { expect } from '../../chai-hooks.js';
import {
    CHILD_PACKAGE_LOCKFILE,
    EMPTY_LOCKFILE,
    EXAMPLE_LOCKFILE,
    PACKAGE_LOCKFILE,
    PACKAGE_LOCKFILE_NO_LINK,
} from '../../data/example-lockfile.js';

suite('PrunedLockfile', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    const withStubs = beforeEach(() => {
        const stubbedFindLockfileDir = stubMethod<FindLockfileDir>();
        const stubbedReadLockfile = stubMethod<ReadLockfile>();
        return {
            stubbedFindLockfileDir: stubbedFindLockfileDir.stub,
            stubbedReadLockfile: stubbedReadLockfile.stub,
            prunedLockfile: new PrunedLockfile(
                stubbedFindLockfileDir.method,
                stubbedReadLockfile.method
            ),
        };
    });

    suite('getPrunedLockfile', () => {
        withStubs.test('Removed unrelated packages', async ctx => {
            ctx.stubbedFindLockfileDir.resolves('/root/cwd');
            ctx.stubbedReadLockfile.resolves(EXAMPLE_LOCKFILE);

            expect(
                await ctx.prunedLockfile.getPrunedLockfile({
                    cwd: '/root/cwd/path/to/package-name',
                    omitLinks: false,
                })
            ).to.deep.equal(PACKAGE_LOCKFILE);

            expect(
                ctx.stubbedFindLockfileDir.calledOnceWithExactly('/root/cwd/path/to/package-name')
            ).to.equal(true);
            expect(
                ctx.stubbedReadLockfile.calledOnceWithExactly('/root/cwd', {
                    ignoreIncompatible: false,
                })
            ).to.equal(true);
        });

        withStubs.test('Excludes child packages', async ctx => {
            ctx.stubbedFindLockfileDir.resolves('/root/cwd');
            ctx.stubbedReadLockfile.resolves(EXAMPLE_LOCKFILE);

            expect(
                await ctx.prunedLockfile.getPrunedLockfile({
                    cwd: '/root/cwd/path/to/package-name/child-package',
                    omitLinks: false,
                })
            ).to.deep.equal(CHILD_PACKAGE_LOCKFILE);
        });

        withStubs.test('Optionally exclude links', async ctx => {
            ctx.stubbedFindLockfileDir.resolves('/root/cwd');
            ctx.stubbedReadLockfile.resolves(EXAMPLE_LOCKFILE);

            expect(
                await ctx.prunedLockfile.getPrunedLockfile({
                    cwd: '/root/cwd/path/to/package-name',
                    omitLinks: true,
                })
            ).to.deep.equal(PACKAGE_LOCKFILE_NO_LINK);
        });

        withStubs.test('No dependencies if package not found', async ctx => {
            ctx.stubbedFindLockfileDir.resolves('/root/cwd');
            ctx.stubbedReadLockfile.resolves(EXAMPLE_LOCKFILE);

            expect(
                await ctx.prunedLockfile.getPrunedLockfile({
                    cwd: '/root/cwd/path/to/some-other-package',
                    omitLinks: false,
                })
            ).to.deep.equal(EMPTY_LOCKFILE);
        });

        withStubs.test('Throws when lockfile dir not found', async ctx => {
            ctx.stubbedFindLockfileDir.resolves();

            await expect(
                ctx.prunedLockfile.getPrunedLockfile({
                    cwd: '/root/cwd/path/to/some-other-package',
                    omitLinks: false,
                })
            ).to.eventually.be.rejectedWith(
                Error,
                'No lockfile found for package at /root/cwd/path/to/some-other-package'
            );

            expect(ctx.stubbedReadLockfile.notCalled).to.equal(true);
        });

        withStubs.test('Throws when lockfile not found', async ctx => {
            ctx.stubbedFindLockfileDir.resolves('/root/cwd');
            ctx.stubbedReadLockfile.resolves(null);

            await expect(
                ctx.prunedLockfile.getPrunedLockfile({
                    cwd: '/root/cwd/path/to/some-other-package',
                    omitLinks: false,
                })
            ).to.eventually.be.rejectedWith(Error, 'No lockfile found at /root/cwd/pnpm-lock.yaml');
        });
    });
});

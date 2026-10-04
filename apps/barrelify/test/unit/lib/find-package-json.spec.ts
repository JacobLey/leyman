import type { FindPackageJSON, ReadFile } from '#internal/lib/dependencies.js';
import { pathToFileURL } from 'node:url';
import { verifyAndRestore } from 'sinon';
import { expect } from '@leyman/expect';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import { FindPackageJson } from '#internal/lib/find-package-json.js';

suite('FindPackageJson', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    const withStubs = beforeEach(() => {
        const stubbedFindPackageJSON = stubMethod<FindPackageJSON>();
        const stubbedReadFile = stubMethod<ReadFile>();
        return {
            stubbedFindPackageJSON: stubbedFindPackageJSON.stub,
            stubbedReadFile: stubbedReadFile.stub,
            findPackageJson: new FindPackageJson(
                stubbedFindPackageJSON.method,
                stubbedReadFile.method
            ),
        };
    });

    suite('isExplicitlyModuleDirectory', () => {
        withStubs.test('Is module', async ctx => {
            ctx.stubbedFindPackageJSON.returns('/<dir>/package.json');
            ctx.stubbedReadFile.resolves(JSON.stringify({ name: '<name>', type: 'module' }));

            expect(await ctx.findPackageJson.isExplicitlyModuleDirectory('/<filename>')).to.equal(
                true
            );

            expect(
                ctx.stubbedFindPackageJSON.calledOnceWithExactly(pathToFileURL('/<filename>'))
            ).to.equal(true);
            expect(
                ctx.stubbedReadFile.calledOnceWithExactly('/<dir>/package.json', 'utf8')
            ).to.equal(true);
        });

        withStubs.test('Is commonjs', async ctx => {
            ctx.stubbedFindPackageJSON.returns('/<dir>/package.json');
            ctx.stubbedReadFile.resolves(JSON.stringify({ name: '<name>', type: 'commonjs' }));

            expect(await ctx.findPackageJson.isExplicitlyModuleDirectory('/<filename>')).to.equal(
                false
            );
        });

        withStubs.test('Omits type', async ctx => {
            ctx.stubbedFindPackageJSON.returns('/<dir>/package.json');
            ctx.stubbedReadFile.resolves(JSON.stringify({ name: '<name>', version: '<version>' }));

            expect(await ctx.findPackageJson.isExplicitlyModuleDirectory('/<filename>')).to.equal(
                false
            );
        });

        withStubs.test('Cannot find package.json', async ctx => {
            ctx.stubbedFindPackageJSON.returns(undefined);

            expect(await ctx.findPackageJson.isExplicitlyModuleDirectory('/<filename>')).to.equal(
                false
            );
            expect(ctx.stubbedReadFile.called).to.equal(false);
        });
    });
});

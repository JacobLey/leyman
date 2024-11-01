import { verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import type { FindImport } from '../../../lib/dependencies.js';
import { FindPackageJson } from '../../../lib/find-package-json.js';
import { expect } from '../../chai-hooks.js';

suite('FindPackageJson', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    const withStubs = beforeEach(() => {
        const stubbedFindImport = stubMethod<FindImport>();
        return {
            stubbedFindImport: stubbedFindImport.stub,
            findPackageJson: new FindPackageJson(stubbedFindImport.method),
        };
    });

    suite('isExplicitlyModuleDirectory', () => {
        withStubs.test('Is module', async ctx => {
            ctx.stubbedFindImport.resolves({
                content: { name: '<name>', type: 'module' },
            });

            expect(await ctx.findPackageJson.isExplicitlyModuleDirectory('<filename>')).to.equal(
                true
            );

            expect(
                ctx.stubbedFindImport.calledOnceWithExactly('package.json', { cwd: '<filename>' })
            ).to.equal(true);
        });

        withStubs.test('Is commonjs', async ctx => {
            ctx.stubbedFindImport.resolves({
                content: { name: '<name>', type: 'commonjs' },
            });

            expect(await ctx.findPackageJson.isExplicitlyModuleDirectory('<filename>')).to.equal(
                false
            );
        });

        withStubs.test('Omits type', async ctx => {
            ctx.stubbedFindImport.resolves({
                content: { name: '<name>', version: '<version>' },
            });

            expect(await ctx.findPackageJson.isExplicitlyModuleDirectory('<filename>')).to.equal(
                false
            );
        });

        withStubs.test('Cannot find package.json', async ctx => {
            ctx.stubbedFindImport.resolves(null);

            expect(await ctx.findPackageJson.isExplicitlyModuleDirectory('<filename>')).to.equal(
                false
            );
        });
    });

    suite('getPackageJsonVersion', () => {
        withStubs.test('Parses version from json', async ctx => {
            ctx.stubbedFindImport.resolves({
                content: {
                    name: '<name>',
                    version: '<version>',
                },
            });

            expect(await ctx.findPackageJson.getPackageJsonVersion()).to.equal('<version>');

            expect(
                ctx.stubbedFindImport.calledOnceWithExactly('package.json', {
                    cwd: import.meta.resolve('../../../lib/find-package-json.js'),
                })
            ).to.equal(true);
        });

        withStubs.test('Cannot parse version from json', async ctx => {
            ctx.stubbedFindImport.resolves({
                content: {
                    name: '<name>',
                    type: 'module',
                },
            });

            await expect(ctx.findPackageJson.getPackageJsonVersion()).to.eventually.be.rejectedWith(
                Error,
                'Unable to load package.json'
            );
        });

        withStubs.test('Cannot find package.json', async ctx => {
            ctx.stubbedFindImport.resolves(null);

            await expect(ctx.findPackageJson.getPackageJsonVersion()).to.eventually.be.rejectedWith(
                Error,
                'Unable to load package.json'
            );
        });
    });
});

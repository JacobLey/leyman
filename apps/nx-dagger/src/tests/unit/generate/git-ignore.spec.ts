import type { readFile as ReadFile } from 'node:fs/promises';
import { verifyAndRestore } from 'sinon';
import { dedent } from 'ts-dedent';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import * as GitIgnore from '../../../generate/git-ignore.js';
import { expect } from '../../chai-hooks.js';

suite('GetGitIgnore', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    suite('getGitIgnore', () => {
        const stubs = beforeEach(() => {
            const stubbedReadFile = stubMethod<typeof ReadFile>();

            return {
                stubbedReadFile: stubbedReadFile.stub,
                getGitIgnore: GitIgnore.getGitIgnoreProvider(
                    stubbedReadFile.method,
                    '<workspace-root>'
                ),
            };
        });

        stubs.test('Loads and parses gitignore', async ctx => {
            ctx.stubbedReadFile.withArgs('<workspace-root>/.gitignore', 'utf8').resolves(dedent`
                foo
                #bar
                  !baz
                foobar
                foo/**
                foo
            `);

            expect(await ctx.getGitIgnore()).to.deep.equal(['foo', '!baz', 'foobar', 'foo/**']);
        });
    });
});

import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { GitHubError } from '#internal/lib/errors.js';
import { GitHub } from '#internal/lib/github.js';
import { api, fakeGitHub, ok } from '#test/helpers/github.js';

const rateLimited =
    (status: number, headers: Readonly<Record<string, string>>): (() => Response) =>
    () =>
        Response.json({ message: 'API rate limit exceeded' }, { status, headers });

suite('GitHub', () => {
    suite('get', () => {
        test('Reads JSON, with the headers GitHub asks for', async () => {
            const fake = fakeGitHub({ [`${api}/repos/o/r`]: ok({ id: 1 }) });

            const github = new GitHub({ fetch: fake.fetch });

            expect(await github.get('/repos/o/r')).to.deep.equal({ id: 1 });
            expect(fake.requests).to.deep.equal([
                {
                    url: `${api}/repos/o/r`,
                    headers: {
                        accept: 'application/vnd.github+json',
                        'user-agent': 'drop-when',
                        'x-github-api-version': '2022-11-28',
                    },
                },
            ]);
        });

        test('Sends the token', async () => {
            const fake = fakeGitHub({ [`${api}/repos/o/r`]: ok({}) });

            const github = new GitHub({ fetch: fake.fetch, token: 'secret' });

            await github.get('/repos/o/r');
            expect(fake.requests[0]?.headers).to.have.property('authorization', 'Bearer secret');
        });

        test('Requests each path once', async () => {
            const fake = fakeGitHub({ [`${api}/repos/o/r`]: ok({}) });
            const github = new GitHub({ fetch: fake.fetch });

            await Promise.all([github.get('/repos/o/r'), github.get('/repos/o/r')]);
            expect(fake.requests).to.have.length(1);
        });

        test('Rejects when GitHub fails', async () => {
            const github = new GitHub({ fetch: fakeGitHub({}).fetch });

            await expect(github.get('/repos/o/r')).to.be.rejectedWith(
                GitHubError,
                `GitHub answered 404 for ${api}/repos/o/r`
            );
        });

        test('Rejects when GitHub cannot be reached', async () => {
            const github = new GitHub({
                fetch: async () => {
                    throw new TypeError('fetch failed');
                },
            });

            await expect(github.get('/repos/o/r')).to.be.rejectedWith(
                GitHubError,
                `Could not reach ${api}/repos/o/r: fetch failed`
            );
        });
    });

    suite('getAll', () => {
        test('Follows the next page until the last', async () => {
            const fake = fakeGitHub({
                [`${api}/repos/o/r/releases?per_page=100`]: ok(
                    [1, 2],
                    `<${api}/repositories/9/releases?per_page=100&page=2>; rel="next", <${api}/repositories/9/releases?per_page=100&page=2>; rel="last"`
                ),
                [`${api}/repositories/9/releases?per_page=100&page=2`]: ok(
                    [3],
                    `<${api}/repositories/9/releases?per_page=100&page=1>; rel="prev", <${api}/repositories/9/releases?per_page=100&page=1>; rel="first"`
                ),
            });

            const github = new GitHub({ fetch: fake.fetch });

            expect(await github.getAll('/repos/o/r/releases?per_page=100')).to.deep.equal([
                1, 2, 3,
            ]);
        });

        test('Requests each list once', async () => {
            const fake = fakeGitHub({ [`${api}/repos/o/r/releases`]: ok([]) });
            const github = new GitHub({ fetch: fake.fetch });

            await Promise.all([
                github.getAll('/repos/o/r/releases'),
                github.getAll('/repos/o/r/releases'),
            ]);
            expect(fake.requests).to.have.length(1);
        });
    });

    suite('Rate limits', () => {
        test('Reports when the limit resets, and that a token raises it', async () => {
            const github = new GitHub({
                fetch: fakeGitHub({
                    [`${api}/repos/o/r`]: rateLimited(403, {
                        'x-ratelimit-remaining': '0',
                        'x-ratelimit-reset': '1795000000',
                    }),
                }).fetch,
            });

            await expect(github.get('/repos/o/r')).to.be.rejectedWith(
                "GitHub's rate limit is used up until 2026-11-18T11:06:40Z (set GITHUB_TOKEN for a higher limit)"
            );
        });

        test('Leaves out the hint with a token', async () => {
            const github = new GitHub({
                fetch: fakeGitHub({
                    [`${api}/repos/o/r`]: rateLimited(429, {
                        'x-ratelimit-remaining': '0',
                        'x-ratelimit-reset': '1795000000',
                    }),
                }).fetch,
                token: 'secret',
            });

            await expect(github.get('/repos/o/r')).to.be.rejectedWith(
                "GitHub's rate limit is used up until 2026-11-18T11:06:40Z"
            );
        });

        test('Reports the wait a secondary limit asks for', async () => {
            const github = new GitHub({
                fetch: fakeGitHub({
                    [`${api}/repos/o/r`]: rateLimited(429, { 'retry-after': '60' }),
                }).fetch,
                token: 'secret',
            });

            await expect(github.get('/repos/o/r')).to.be.rejectedWith(
                "GitHub's secondary rate limit asks to wait 60 seconds"
            );
        });

        test('Reports any other 403 by its status', async () => {
            const github = new GitHub({
                fetch: fakeGitHub({ [`${api}/repos/o/r`]: rateLimited(403, {}) }).fetch,
            });

            await expect(github.get('/repos/o/r')).to.be.rejectedWith(
                `GitHub answered 403 for ${api}/repos/o/r`
            );
        });
    });
});

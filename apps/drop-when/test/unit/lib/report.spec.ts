import type { Condition } from '#internal/lib/marker.js';
import type { Outcome, Resolved } from '#internal/lib/resolve.js';
import { expect } from '@leyman/expect';
import { beforeEach, suite, test } from 'mocha-chain';
import { renderReport, runReport } from '#internal/lib/report.js';
import { api, fakeGitHub, ok, pullResponse } from '#test/helpers/github.js';
import { createRepo } from '#test/helpers/repo.js';

const token = ['drop', 'when:'].join('-');
const now = Temporal.Instant.from('2026-11-18T12:00:00Z');
const sha = 'e8d2bdc501b3ba6f03922db5e595770d4763d9da';
const release = { tag: 'v1.1.0', publishedAt: Temporal.Instant.from('2026-11-05T09:30:00Z') };

const url = (number: number): Condition => ({
    kind: 'released',
    url: `https://github.com/o/r/pull/${number}`,
    owner: 'o',
    repo: 'r',
    type: 'pull',
    number,
});

const entry = (line: number, condition: Condition, outcome: Outcome): Resolved => ({
    path: 'a.ts',
    line,
    condition,
    outcome,
});

suite('renderReport', () => {
    test('Puts each outcome in its section, by urgency', () => {
        const resolved = [
            entry(1, url(1), { status: 'failed', error: 'GitHub answered 500' }),
            entry(2, url(2), { status: 'open' }),
            entry(3, url(3), { status: 'unreleased', sha }),
            entry(4, url(4), {
                status: 'waiting',
                dueAt: Temporal.Instant.from('2026-11-22T00:00:00Z'),
                release,
            }),
            entry(
                5,
                { kind: 'date', date: '2026-12-01' },
                {
                    status: 'waiting',
                    dueAt: Temporal.Instant.from('2026-12-01T00:00:00Z'),
                }
            ),
            entry(6, url(6), { status: 'closedUnmerged' }),
            entry(7, url(7), { status: 'closedNotPlanned' }),
            entry(8, url(8), { status: 'closedNoCommit' }),
            entry(9, url(9), { status: 'noReleases', sha }),
            entry(10, url(10), { status: 'due', release }),
            entry(11, { kind: 'date', date: '2026-11-01' }, { status: 'due' }),
        ];

        expect(renderReport(resolved, { now, minAge: '7d' })).to.equal(
            [
                '# drop-when report',
                '',
                '11 markers, at 2026-11-18T12:00Z, with a minimum release age of 7d.',
                '',
                '## Due',
                '',
                '- `a.ts:10` https://github.com/o/r/pull/10: released in `v1.1.0` on 2026-11-05T09:30Z',
                '- `a.ts:11` 2026-11-01',
                '',
                '## Decide by hand',
                '',
                '- `a.ts:6` https://github.com/o/r/pull/6: closed without merging',
                '- `a.ts:7` https://github.com/o/r/pull/7: closed as not planned',
                '- `a.ts:8` https://github.com/o/r/pull/8: closed with no commit named: point the marker at the pull request that fixed it',
                '- `a.ts:9` https://github.com/o/r/pull/9: fixed by `e8d2bdc`, but the repository has no GitHub Releases to tell when it ships',
                '',
                '## Waiting',
                '',
                '- `a.ts:3` https://github.com/o/r/pull/3: fixed by `e8d2bdc`, in no release yet',
                '- `a.ts:4` https://github.com/o/r/pull/4: released in `v1.1.0` on 2026-11-05T09:30Z, due on 2026-11-22T00:00Z',
                '- `a.ts:5` 2026-12-01: due on 2026-12-01T00:00Z',
                '',
                '## Open',
                '',
                '- `a.ts:2` https://github.com/o/r/pull/2',
                '',
                '## Failed lookups',
                '',
                '- `a.ts:1` https://github.com/o/r/pull/1: GitHub answered 500',
                '',
            ].join('\n')
        );
    });

    test('Has only the header without markers', () => {
        expect(renderReport([], { now, minAge: '12h' })).to.equal(
            '# drop-when report\n\n0 markers, at 2026-11-18T12:00Z, with a minimum release age of 12h.\n'
        );
    });
});

suite('runReport', () => {
    const options = { cwd: '', paths: [], minAge: '7d', failOnDue: false };

    test('Rejects a minimum age it cannot read', async () => {
        expect(
            await runReport({ ...options, minAge: 'a week' }, { fetch: fakeGitHub({}).fetch, now })
        ).to.deep.equal({
            stdout: '',
            stderr: '--min-age must be whole days or hours, like 7d or 12h, got "a week"\n',
            exitCode: 1,
        });
    });

    suite('Outside a Git repository', () => {
        const withDirectory = beforeEach(async () => createRepo({ git: false }));

        withDirectory.afterEach(async ({ repo }) => {
            await repo.cleanup();
        });

        withDirectory.test('Fails', async ({ repo }) => {
            const result = await runReport(
                { ...options, cwd: repo.path },
                { fetch: fakeGitHub({}).fetch, now }
            );
            expect(result).to.include({ stdout: '', exitCode: 1 });
            expect(result.stderr).to.contain('not a git repository');
        });
    });

    suite('In a Git repository', () => {
        const withRepo = beforeEach(async () => createRepo());

        withRepo.afterEach(async ({ repo }) => {
            await repo.cleanup();
        });

        withRepo.test('Fails on malformed markers, before any request', async ({ repo, write }) => {
            await write({
                'a.ts': `// ${token} released https://github.com/o/r/pull/1\n// ${token} soon\n`,
            });
            const fake = fakeGitHub({});

            const result = await runReport(
                { ...options, cwd: repo.path },
                { fetch: fake.fetch, now }
            );
            expect(result).to.include({ stdout: '', exitCode: 1 });
            expect(result.stderr).to.contain('a.ts:2: expected');
            expect(fake.requests).to.deep.equal([]);
        });

        withRepo.test('Fails when a lookup fails', async ({ repo, write }) => {
            await write({ 'a.ts': `// ${token} released https://github.com/o/r/pull/1\n` });

            const result = await runReport(
                { ...options, cwd: repo.path },
                { fetch: fakeGitHub({}).fetch, now }
            );
            expect(result).to.include({ stderr: '', exitCode: 1 });
            expect(result.stdout).to.contain('## Failed lookups');
        });

        withRepo.test('Sends the token', async ({ repo, write }) => {
            await write({ 'a.ts': `// ${token} released https://github.com/o/r/pull/1\n` });
            const fake = fakeGitHub({
                [`${api}/repos/o/r/pulls/1`]: ok(pullResponse({ number: 1, state: 'open' })),
            });

            const result = await runReport(
                { ...options, cwd: repo.path },
                { now, fetch: fake.fetch, token: 'secret' }
            );
            expect(result).to.include({ exitCode: 0 });
            expect(fake.requests[0]?.headers).to.have.property('authorization', 'Bearer secret');
        });

        withRepo.test('Succeeds with a marker due', async ({ repo, write }) => {
            await write({ 'a.ts': `// ${token} 2026-11-01\n` });

            const result = await runReport(
                { ...options, cwd: repo.path },
                { fetch: fakeGitHub({}).fetch, now }
            );
            expect(result).to.deep.equal({
                stdout: '# drop-when report\n\n1 marker, at 2026-11-18T12:00Z, with a minimum release age of 7d.\n\n## Due\n\n- `a.ts:1` 2026-11-01\n',
                stderr: '',
                exitCode: 0,
            });
        });

        withRepo.test('Fails with a marker due, when asked to', async ({ repo, write }) => {
            await write({ 'a.ts': `// ${token} 2026-11-01\n` });

            const result = await runReport(
                { ...options, cwd: repo.path, failOnDue: true },
                { fetch: fakeGitHub({}).fetch, now }
            );
            expect(result).to.include({ exitCode: 1 });
        });

        withRepo.test(
            'Succeeds with nothing due, when asked to fail on due',
            async ({ repo, write }) => {
                await write({ 'a.ts': `// ${token} 2026-12-01\n` });

                const result = await runReport(
                    { ...options, cwd: repo.path, failOnDue: true },
                    { fetch: fakeGitHub({}).fetch, now }
                );
                expect(result).to.include({ exitCode: 0 });
            }
        );
    });
});

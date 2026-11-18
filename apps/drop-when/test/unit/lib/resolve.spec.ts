import type { Condition, Marker } from '#internal/lib/marker.js';
import type { Outcome } from '#internal/lib/resolve.js';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { GitHub } from '#internal/lib/github.js';
import { resolveMarker } from '#internal/lib/resolve.js';
import {
    api,
    closedEvent,
    compareResponse,
    fakeGitHub,
    issueResponse,
    ok,
    otherEvent,
    pullResponse,
    releaseResponse,
} from '#test/helpers/github.js';

const repo = `${api}/repos/owner/repo`;
const sha = 'e8d2bdc501b3ba6f03922db5e595770d4763d9da';
const timing = {
    minAge: Temporal.Duration.from({ hours: 168 }),
    now: Temporal.Instant.from('2026-11-18T12:00:00Z'),
};

const released = (type: 'issues' | 'pull', number: number): Condition => ({
    kind: 'released',
    url: `https://github.com/owner/repo/${type}/${number}`,
    owner: 'owner',
    repo: 'repo',
    type,
    number,
});

const resolve = async (
    condition: Condition,
    routes: Parameters<typeof fakeGitHub>[0]
): Promise<Outcome> => {
    const marker: Marker = { path: 'a.ts', line: 1, condition };
    const { outcome } = await resolveMarker(
        new GitHub({ fetch: fakeGitHub(routes).fetch }),
        marker,
        timing
    );
    return outcome;
};

const mergedPull = {
    [`${repo}/pulls/7`]: ok(
        pullResponse({ number: 7, state: 'closed', mergedAt: '2026-11-01T00:00:00Z', sha })
    ),
};

suite('resolveMarker', () => {
    suite('Date', () => {
        test('Is due from the start of the day, UTC', async () => {
            expect(await resolve({ kind: 'date', date: '2026-11-18' }, {})).to.deep.equal({
                status: 'due',
            });
        });

        test('Waits for a later day', async () => {
            expect(await resolve({ kind: 'date', date: '2026-11-19' }, {})).to.deep.equal({
                status: 'waiting',
                dueAt: Temporal.Instant.from('2026-11-19T00:00:00Z'),
            });
        });
    });

    suite('Pull request', () => {
        test('Is open', async () => {
            expect(
                await resolve(released('pull', 7), {
                    [`${repo}/pulls/7`]: ok(pullResponse({ number: 7, state: 'open' })),
                })
            ).to.deep.equal({ status: 'open' });
        });

        test('Is closed without merging', async () => {
            expect(
                await resolve(released('pull', 7), {
                    [`${repo}/pulls/7`]: ok(pullResponse({ number: 7, state: 'closed' })),
                })
            ).to.deep.equal({ status: 'closedUnmerged' });
        });

        test('Is due once the first release containing it is old enough', async () => {
            expect(
                await resolve(released('pull', 7), {
                    ...mergedPull,
                    [`${repo}/releases?per_page=100`]: ok([
                        releaseResponse({ tag: 'v1.1.0', publishedAt: '2026-11-05T00:00:00Z' }),
                    ]),
                    [`${repo}/compare/v1.1.0...${sha}?per_page=1`]: ok(compareResponse('behind')),
                })
            ).to.deep.equal({
                status: 'due',
                release: {
                    tag: 'v1.1.0',
                    publishedAt: Temporal.Instant.from('2026-11-05T00:00:00Z'),
                },
            });
        });

        test('Waits until the release is old enough', async () => {
            expect(
                await resolve(released('pull', 7), {
                    ...mergedPull,
                    [`${repo}/releases?per_page=100`]: ok([
                        releaseResponse({ tag: 'v1.1.0', publishedAt: '2026-11-15T00:00:00Z' }),
                    ]),
                    [`${repo}/compare/v1.1.0...${sha}?per_page=1`]: ok(
                        compareResponse('identical')
                    ),
                })
            ).to.deep.equal({
                status: 'waiting',
                dueAt: Temporal.Instant.from('2026-11-22T00:00:00Z'),
                release: {
                    tag: 'v1.1.0',
                    publishedAt: Temporal.Instant.from('2026-11-15T00:00:00Z'),
                },
            });
        });

        test('Takes the oldest release after the merge whose tag contains it', async () => {
            const outcome = await resolve(released('pull', 7), {
                ...mergedPull,
                [`${repo}/releases?per_page=100`]: ok([
                    releaseResponse({ tag: 'v2.0.0', publishedAt: '2026-11-04T00:00:00Z' }),
                    releaseResponse({ tag: 'v1.2.0', publishedAt: '2026-11-03T00:00:00Z' }),
                    releaseResponse({ tag: 'other/v1.0.0', publishedAt: '2026-11-03T00:00:00Z' }),
                    releaseResponse({ tag: 'v1.1.1', publishedAt: '2026-11-02T00:00:00Z' }),
                    // Before the merge, so never compared: the fake answers 404 for it
                    releaseResponse({ tag: 'v1.0.0', publishedAt: '2026-10-01T00:00:00Z' }),
                ]),
                // A backport branch, without the fix
                [`${repo}/compare/v1.1.1...${sha}?per_page=1`]: ok(compareResponse('diverged')),
                [`${repo}/compare/other%2Fv1.0.0...${sha}?per_page=1`]: ok(
                    compareResponse('ahead')
                ),
                [`${repo}/compare/v1.2.0...${sha}?per_page=1`]: ok(compareResponse('behind')),
            });
            expect(outcome).to.have.nested.property('release.tag', 'v1.2.0');
        });

        test('Ignores drafts and prereleases', async () => {
            expect(
                await resolve(released('pull', 7), {
                    ...mergedPull,
                    [`${repo}/releases?per_page=100`]: ok([
                        releaseResponse({
                            tag: 'v2.0.0-rc.1',
                            publishedAt: '2026-11-02T00:00:00Z',
                            prerelease: true,
                        }),
                        releaseResponse({ tag: 'v2.0.0', publishedAt: null, draft: true }),
                    ]),
                })
            ).to.deep.equal({ status: 'noReleases', sha });
        });

        test('Is unreleased when no release contains it', async () => {
            expect(
                await resolve(released('pull', 7), {
                    ...mergedPull,
                    [`${repo}/releases?per_page=100`]: ok([
                        releaseResponse({ tag: 'v1.0.0', publishedAt: '2026-10-01T00:00:00Z' }),
                    ]),
                })
            ).to.deep.equal({ status: 'unreleased', sha });
        });
    });

    suite('Issue', () => {
        test('Is open', async () => {
            expect(
                await resolve(released('issues', 3), {
                    [`${repo}/issues/3`]: ok(issueResponse({ number: 3, state: 'open' })),
                })
            ).to.deep.equal({ status: 'open' });
        });

        test('Is closed as not planned', async () => {
            expect(
                await resolve(released('issues', 3), {
                    [`${repo}/issues/3`]: ok(
                        issueResponse({ number: 3, state: 'closed', stateReason: 'not_planned' })
                    ),
                })
            ).to.deep.equal({ status: 'closedNotPlanned' });
        });

        test('Counts a duplicate as not planned', async () => {
            expect(
                await resolve(released('issues', 3), {
                    [`${repo}/issues/3`]: ok(
                        issueResponse({ number: 3, state: 'closed', stateReason: 'duplicate' })
                    ),
                })
            ).to.deep.equal({ status: 'closedNotPlanned' });
        });

        test('Follows the commit that closed it to its release', async () => {
            expect(
                await resolve(released('issues', 3), {
                    [`${repo}/issues/3`]: ok(
                        issueResponse({ number: 3, state: 'closed', stateReason: 'completed' })
                    ),
                    [`${repo}/issues/3/timeline?per_page=100`]: ok([
                        otherEvent('labeled', '2026-10-01T00:00:00Z'),
                        closedEvent({ createdAt: '2026-11-01T00:00:00Z', sha }),
                    ]),
                    [`${repo}/releases?per_page=100`]: ok([
                        releaseResponse({ tag: 'v1.1.0', publishedAt: '2026-11-02T00:00:00Z' }),
                    ]),
                    [`${repo}/compare/v1.1.0...${sha}?per_page=1`]: ok(compareResponse('behind')),
                })
            ).to.have.property('status', 'due');
        });

        test('Reads the last time it was closed, across pages of its timeline', async () => {
            expect(
                await resolve(released('issues', 3), {
                    [`${repo}/issues/3`]: ok(issueResponse({ number: 3, state: 'closed' })),
                    [`${repo}/issues/3/timeline?per_page=100`]: ok(
                        [
                            closedEvent({ createdAt: '2026-10-01T00:00:00Z', sha }),
                            otherEvent('reopened', '2026-10-02T00:00:00Z'),
                        ],
                        `<${api}/repositories/9/issues/3/timeline?per_page=100&page=2>; rel="next"`
                    ),
                    [`${api}/repositories/9/issues/3/timeline?per_page=100&page=2`]: ok([
                        closedEvent({ createdAt: '2026-11-01T00:00:00Z' }),
                    ]),
                })
            ).to.deep.equal({ status: 'closedNoCommit' });
        });

        test('Has no commit without a closed event', async () => {
            expect(
                await resolve(released('issues', 3), {
                    [`${repo}/issues/3`]: ok(issueResponse({ number: 3, state: 'closed' })),
                    [`${repo}/issues/3/timeline?per_page=100`]: ok([]),
                })
            ).to.deep.equal({ status: 'closedNoCommit' });
        });

        test('Resolves a pull request given as an issue', async () => {
            expect(
                await resolve(released('issues', 7), {
                    [`${repo}/issues/7`]: ok(
                        issueResponse({ number: 7, state: 'closed', pullRequest: true })
                    ),
                    [`${repo}/pulls/7`]: ok(pullResponse({ number: 7, state: 'closed' })),
                })
            ).to.deep.equal({ status: 'closedUnmerged' });
        });
    });

    test('Turns a failed request into an outcome', async () => {
        expect(await resolve(released('pull', 7), {})).to.deep.equal({
            status: 'failed',
            error: `GitHub answered 404 for ${repo}/pulls/7`,
        });
    });
});

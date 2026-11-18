import type { Fetch } from '#internal/lib/github.js';

export const api = 'https://api.github.com';

export interface FakeRequest {
    readonly url: string;
    readonly headers: Readonly<Record<string, string>>;
}

export interface FakeGitHub {
    readonly fetch: Fetch;
    /**
     * Every request, in order.
     */
    readonly requests: FakeRequest[];
}

/**
 * Answers for GitHub's API from a table of URLs, and 404 (with GitHub's body) for any other.
 *
 * @param routes - a response for each full URL, made afresh for each request
 * @returns the fake `fetch`, and the requests it received
 */
export const fakeGitHub = (routes: Readonly<Record<string, () => Response>>): FakeGitHub => {
    const requests: FakeRequest[] = [];
    return {
        fetch: async (url, { headers }) => {
            requests.push({ url, headers });
            const route = routes[url];
            return route
                ? route()
                : Response.json(
                      {
                          message: 'Not Found',
                          documentation_url: 'https://docs.github.com/rest',
                          status: '404',
                      },
                      { status: 404 }
                  );
        },
        requests,
    };
};

/**
 * Answers with success.
 *
 * @param body - the JSON
 * @param [link] - a `Link` header, for a page of a list
 * @returns a successful answer
 */
export const ok =
    (body: unknown, link?: string): (() => Response) =>
    () =>
        Response.json(body, link === undefined ? {} : { headers: { link } });

// The response shapes below are copied from GitHub's API (ajv-validator/ajv, dubzzz/fast-check), trimmed to the
// fields around the ones drop-when reads.

export const pullResponse = ({
    number,
    state,
    mergedAt = null,
    sha = null,
}: {
    readonly number: number;
    readonly state: 'closed' | 'open';
    readonly mergedAt?: string | null;
    readonly sha?: string | null;
}): object => ({
    number,
    state,
    url: `${api}/repos/owner/repo/pulls/${number}`,
    html_url: `https://github.com/owner/repo/pull/${number}`,
    title: 'Fix the bug',
    created_at: '2026-04-23T16:49:41Z',
    closed_at: state === 'closed' ? (mergedAt ?? '2026-04-23T18:48:43Z') : null,
    merged: mergedAt !== null,
    merged_at: mergedAt,
    merge_commit_sha: sha,
});

export const issueResponse = ({
    number,
    state,
    stateReason = null,
    pullRequest = false,
}: {
    readonly number: number;
    readonly state: 'closed' | 'open';
    readonly stateReason?: string | null;
    readonly pullRequest?: boolean;
}): object => ({
    number,
    state,
    url: `${api}/repos/owner/repo/issues/${number}`,
    html_url: `https://github.com/owner/repo/issues/${number}`,
    title: 'A bug',
    state_reason: stateReason,
    closed_at: state === 'closed' ? '2026-11-17T22:17:27Z' : null,
    ...(pullRequest && {
        pull_request: {
            url: `${api}/repos/owner/repo/pulls/${number}`,
            merged_at: null,
        },
    }),
});

export const closedEvent = ({
    createdAt,
    sha = null,
}: {
    readonly createdAt: string;
    readonly sha?: string | null;
}): object => ({
    id: 26_036_054_624,
    event: 'closed',
    commit_id: sha,
    commit_url: sha === null ? null : `${api}/repos/owner/repo/commits/${sha}`,
    created_at: createdAt,
    state_reason: 'completed',
});

export const otherEvent = (event: string, createdAt: string): object => ({
    event,
    id: 26_036_054_625,
    commit_id: null,
    created_at: createdAt,
});

export const releaseResponse = ({
    tag,
    publishedAt,
    draft = false,
    prerelease = false,
}: {
    readonly tag: string;
    readonly publishedAt: string | null;
    readonly draft?: boolean;
    readonly prerelease?: boolean;
}): object => ({
    draft,
    prerelease,
    url: `${api}/repos/owner/repo/releases/313223190`,
    html_url: `https://github.com/owner/repo/releases/tag/${tag}`,
    id: 313_223_190,
    tag_name: tag,
    target_commitish: 'main',
    name: tag,
    created_at: '2026-04-24T13:11:54Z',
    published_at: publishedAt,
});

export const compareResponse = (status: 'ahead' | 'behind' | 'diverged' | 'identical'): object => ({
    status,
    url: `${api}/repos/owner/repo/compare/v1.0.0...abc`,
    ahead_by: status === 'ahead' || status === 'diverged' ? 1 : 0,
    behind_by: status === 'behind' || status === 'diverged' ? 1 : 0,
    total_commits: 0,
    commits: [],
});

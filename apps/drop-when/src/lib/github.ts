import { GitHubError } from './errors.js';

/**
 * The part of `fetch` drop-when uses, so tests can answer for GitHub.
 */
export type Fetch = (
    url: string,
    init: { readonly headers: Readonly<Record<string, string>> }
) => Promise<Response>;

const apiUrl = 'https://api.github.com';
const forbidden = 403;
const tooManyRequests = 429;
const millisecondsPerSecond = 1000;

/**
 * Finds the next page in a `Link` header: `<https://api.github.com/...&page=2>; rel="next", <...>; rel="last"`.
 *
 * @param header - the header, when GitHub sent one
 * @returns the next page's URL, or `undefined` on the last page
 * @see {@link https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api}
 */
const nextLink = (header: string | null): string | undefined => {
    const link = (header ?? '')
        .split(',')
        .map(part => part.split(';').map(piece => piece.trim()))
        .find(([, ...params]) => params.includes('rel="next"'));
    return link?.[0]?.slice(1, -1);
};

/**
 * A client for the few GitHub REST API endpoints drop-when reads.
 *
 * Each URL (each page of a list) is requested once per client, so markers that share an issue or a repository's
 * releases share the requests, and their failures.
 */
export class GitHub {
    readonly #fetch: Fetch;
    readonly #token: string | undefined;
    readonly #requests = new Map<
        string,
        Promise<{ readonly body: unknown; readonly next?: string }>
    >();

    /**
     * @param options - how to reach GitHub
     * @param options.fetch - makes the requests
     * @param options.token - sent as a bearer token when set. It only raises the rate limit: public data reads the
     * same without it
     */
    public constructor({ fetch, token }: { readonly fetch: Fetch; readonly token?: string }) {
        this.#fetch = fetch;
        this.#token = token;
    }

    /**
     * Reads one resource.
     *
     * @param path - API path, from `/repos`
     * @returns the parsed JSON
     * @rejects {GitHubError} when GitHub can't be reached or doesn't answer with success
     */
    public async get<T>(path: string): Promise<T> {
        const { body } = await this.#page(`${apiUrl}${path}`);
        return body as T;
    }

    /**
     * Reads the pages of a list, following the `Link` header's `next` URL.
     *
     * @param path - API path, from `/repos`, with `per_page=100` to make the fewest requests
     * @param [isLast] - whether a page is the last one needed, so the pages after it are never requested
     * @returns every element read, in the order GitHub lists them
     * @rejects {GitHubError} when GitHub can't be reached or doesn't answer with success
     */
    public async getAll<T>(
        path: string,
        isLast: (page: readonly T[]) => boolean = () => false
    ): Promise<T[]> {
        const all: T[] = [];
        let url: string | undefined = `${apiUrl}${path}`;
        while (url !== undefined) {
            const page = await this.#page(url);
            const body = page.body as T[];
            all.push(...body);
            url = isLast(body) ? undefined : page.next;
        }
        return all;
    }

    async #page(url: string): Promise<{ readonly body: unknown; readonly next?: string }> {
        let pending = this.#requests.get(url);
        if (pending === undefined) {
            pending = this.#request(url);
            this.#requests.set(url, pending);
        }
        return pending;
    }

    async #request(url: string): Promise<{ readonly body: unknown; readonly next?: string }> {
        let response: Response;
        try {
            response = await this.#fetch(url, {
                headers: {
                    accept: 'application/vnd.github+json',
                    'user-agent': 'drop-when',
                    'x-github-api-version': '2022-11-28',
                    ...(this.#token !== undefined && { authorization: `Bearer ${this.#token}` }),
                },
            });
        } catch (error) {
            throw new GitHubError(url, `Could not reach ${url}: ${(error as Error).message}`);
        }

        if (!response.ok) {
            throw this.#failure(url, response);
        }

        const next = nextLink(response.headers.get('link'));
        return { body: await response.json(), ...(next !== undefined && { next }) };
    }

    /**
     * A rate limit is reported as such, never retried, so a run's result never depends on how long it waited.
     *
     * @param url - the URL requested
     * @param response - GitHub's answer
     * @returns the error to report
     * @see {@link https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api#rate-limit-errors}
     */
    #failure(url: string, { headers, status }: Response): GitHubError {
        if (status === forbidden || status === tooManyRequests) {
            const hint = this.#token === undefined ? ' (set GITHUB_TOKEN for a higher limit)' : '';
            if (headers.get('x-ratelimit-remaining') === '0') {
                const reset = Temporal.Instant.fromEpochMilliseconds(
                    Number(headers.get('x-ratelimit-reset')) * millisecondsPerSecond
                );
                return new GitHubError(
                    url,
                    `GitHub's rate limit is used up until ${reset.toString()}${hint}`
                );
            }
            const retryAfter = headers.get('retry-after');
            if (retryAfter !== null) {
                return new GitHubError(
                    url,
                    `GitHub's secondary rate limit asks to wait ${retryAfter} seconds${hint}`
                );
            }
        }
        return new GitHubError(url, `GitHub answered ${status} for ${url}`);
    }
}

export interface FakeFetch {
    /**
     * URLs requested, in order.
     */
    requested: string[];
    restore: () => void;
}

/**
 * Replace `globalThis.fetch` with one that serves each URL from a map, so tests can use any host.
 * A URL in `schemas` is served as JSON, one in `redirects` as a `302` to its target, and anything
 * else as a `404`.
 *
 * @param routes - URLs to serve
 * @param routes.schemas - schema text by URL
 * @param [routes.redirects] - where to redirect, by URL
 * @returns URLs requested, and a function to restore `fetch`
 */
export const fakeFetch = (routes: {
    redirects?: Record<string, string>;
    schemas: Record<string, string>;
}): FakeFetch => {
    const original = globalThis.fetch;
    const requested: string[] = [];
    // eslint-disable-next-line unicorn/no-global-object-property-assignment -- genever calls the global fetch, and tests serve any host
    globalThis.fetch = async input => {
        const { href: url } = new URL(input instanceof Request ? input.url : input);
        requested.push(url);
        const location = routes.redirects?.[url];
        if (location !== undefined) {
            return new Response(null, { headers: { location }, status: 302 });
        }
        const schema = routes.schemas[url];
        return schema === undefined
            ? new Response(null, { status: 404 })
            : new Response(schema, { headers: { 'content-type': 'application/json' } });
    };
    return {
        requested,
        restore: () => {
            // eslint-disable-next-line unicorn/no-global-object-property-assignment -- restores the original
            globalThis.fetch = original;
        },
    };
};

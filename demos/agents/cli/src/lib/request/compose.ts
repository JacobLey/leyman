/**
 * Sends a request and resolves with its response: `fetch`, with the input already a `Request`.
 */
export type Send = (request: Request) => Promise<Response>;

/**
 * One concern of sending a request (a timeout, retries, auth...): it wraps the next `Send` in its own. A middleware
 * owns the request it's given, body and all: one that sends it more than once sends clones until the last send.
 */
export type Middleware = (next: Send) => Send;

/**
 * A `fetch` that sends each request through the middlewares in order: the first one wraps the rest.
 *
 * @param middlewares - What the request goes through, outermost first
 * @param send - What finally sends it
 * @returns The `fetch`
 */
export const compose = (
    middlewares: readonly Middleware[],
    send: Send = async request => fetch(request)
): typeof fetch => {
    let composed = send;
    for (const middleware of middlewares.toReversed()) {
        composed = middleware(composed);
    }
    return async (input, init) => composed(new Request(input, init));
};

import { NotesMcpAuthorizationServerError } from './errors.js';

/**
 * How long a request to another server may take: one that never answers fails, rather than holding a tool call
 * forever.
 */
export const requestTimeoutMs = 10_000;

/**
 * The endpoints of an authorization server's metadata this server uses: its keys to verify tokens with, and where to
 * exchange them.
 */
export type AuthorizationServerEndpoint = 'jwks_uri' | 'token_endpoint';

/**
 * An endpoint of an authorization server, by OpenID Connect discovery (`/.well-known/openid-configuration`), which
 * every common provider serves. Only the endpoint asked for is required, so an issuer that, say, exchanges no
 * tokens can still have its tokens verified.
 *
 * @param issuer - The authorization server
 * @param endpoint - Which endpoint
 * @returns Its URL
 * @rejects {NotesMcpAuthorizationServerError} When the document is missing, names another issuer, or lacks the
 * endpoint
 */
export const discover = async (
    issuer: string,
    endpoint: AuthorizationServerEndpoint
): Promise<string> => {
    const response = await fetch(`${issuer.replace(/\/$/v, '')}/.well-known/openid-configuration`, {
        signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) {
        throw new NotesMcpAuthorizationServerError(issuer, `discovery answered ${response.status}`);
    }
    const metadata = (await response.json()) as Partial<
        Record<'issuer' | AuthorizationServerEndpoint, unknown>
    >;
    // A document for another issuer would trust its keys, and send it credentials, for this one
    if (metadata.issuer !== issuer) {
        throw new NotesMcpAuthorizationServerError(issuer, 'discovery named another issuer');
    }
    const url = metadata[endpoint];
    if (typeof url !== 'string') {
        throw new NotesMcpAuthorizationServerError(issuer, `discovery named no ${endpoint}`);
    }
    return url;
};

// eslint-disable-next-line jsdoc/require-rejects -- The function it returns rejects, not this one
/**
 * Creates a value once, on first use, and again after creating it fails, so a failure (e.g. an issuer that's down) is
 * never kept.
 *
 * @param create - Makes the value
 * @returns The value, when asked for
 */
export const lazily = <T>(create: () => Promise<T>): (() => Promise<T>) => {
    let pending: Promise<T> | null = null;
    return async () => {
        pending ??= create();
        try {
            return await pending;
        } catch (error) {
            pending = null;
            throw error;
        }
    };
};

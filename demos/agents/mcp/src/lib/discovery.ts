import { NotesMcpAuthorizationServerError } from './errors.js';

/**
 * How long a request to another server may take: one that never answers fails, rather than holding a tool call
 * forever.
 */
export const requestTimeoutMs = 10_000;

/**
 * The parts of an authorization server's metadata this server uses.
 */
export interface AuthorizationServerMetadata {
    readonly issuer: string;
    readonly jwks_uri: string;
    readonly token_endpoint: string;
}

/**
 * An authorization server's metadata, by OpenID Connect discovery (`/.well-known/openid-configuration`), which every
 * common provider serves.
 *
 * @param issuer - The authorization server
 * @returns Its metadata
 * @rejects {NotesMcpAuthorizationServerError} When the document is missing, names another issuer, or lacks an
 * endpoint
 */
export const discover = async (issuer: string): Promise<AuthorizationServerMetadata> => {
    const response = await fetch(`${issuer.replace(/\/$/v, '')}/.well-known/openid-configuration`, {
        signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) {
        throw new NotesMcpAuthorizationServerError(issuer, `discovery answered ${response.status}`);
    }
    const metadata = (await response.json()) as Partial<
        Record<keyof AuthorizationServerMetadata, unknown>
    >;
    // A document for another issuer would trust its keys, and send it credentials, for this one
    if (
        metadata.issuer !== issuer ||
        typeof metadata.jwks_uri !== 'string' ||
        typeof metadata.token_endpoint !== 'string'
    ) {
        throw new NotesMcpAuthorizationServerError(
            issuer,
            'discovery named another issuer, or no keys or token endpoint'
        );
    }
    return metadata as AuthorizationServerMetadata;
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

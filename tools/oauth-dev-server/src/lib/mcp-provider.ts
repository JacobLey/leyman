import type {
    OAuthClientMetadata,
    OAuthClientProvider,
    OAuthDiscoveryState,
    StoredOAuthClientInformation,
    StoredOAuthTokens,
} from '@modelcontextprotocol/client';
import { followAuthorization } from './browser.js';

/**
 * @import { DevAuthorizationFlowError } from './errors.js'
 */

export interface DevOAuthClientProviderOptions {
    /**
     * A public client registered with the dev authorization server (`clients`).
     */
    readonly clientId: string;
    /**
     * One of the client's redirect URIs. A loopback one may name any port. Nothing needs to listen there: the
     * redirect is never fetched.
     */
    readonly redirectUri: string;
    /**
     * Who signs in (`login_hint`).
     *
     * @default the server's `accountId`
     */
    readonly user?: string | undefined;
    /**
     * The browser's cookies, kept across authorizations like a browser profile, so stepping up to more scopes
     * resumes the session.
     *
     * @default a new, empty jar, kept for this provider's authorizations
     */
    readonly cookies?: Map<string, string> | undefined;
}

/**
 * An MCP client's OAuth provider for tests against the dev authorization server: a pre-registered public client,
 * keeping its tokens in memory, whose user is played by `followAuthorization`. When the SDK sends the user to
 * authorize, it signs in (as `user`) and keeps the redirect back in `callback`, for the transport's `finishAuth`.
 */
export class DevOAuthClientProvider implements OAuthClientProvider {
    public readonly redirectUrl: string;
    public readonly clientMetadata: OAuthClientMetadata;
    /**
     * Every authorization URL the SDK sent the user to, in order: one per login or step-up.
     */
    public readonly authorizations: URL[] = [];
    /**
     * Where the last authorization redirected back to, with its `code` (or `error`), until taken by
     * `takeCallback`.
     */
    public callback: URL | null = null;
    readonly #clientId: string;
    readonly #user: string | undefined;
    readonly #cookies: Map<string, string>;
    #tokens: StoredOAuthTokens | undefined;
    #codeVerifier = '';
    #discoveryState: OAuthDiscoveryState | undefined;

    /**
     * @param options - The client, and who signs in
     */
    public constructor(options: DevOAuthClientProviderOptions) {
        this.#clientId = options.clientId;
        this.#user = options.user;
        this.#cookies = options.cookies ?? new Map<string, string>();
        this.redirectUrl = options.redirectUri;
        this.clientMetadata = {
            client_name: options.clientId,
            redirect_uris: [options.redirectUri],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
        };
    }

    public clientInformation(): StoredOAuthClientInformation {
        return { client_id: this.#clientId };
    }

    public tokens(): StoredOAuthTokens | undefined {
        return this.#tokens;
    }

    public saveTokens(tokens: StoredOAuthTokens): void {
        this.#tokens = tokens;
    }

    /**
     * Plays the user: signs in at the authorization URL, and keeps where it redirects back to in `callback`.
     *
     * @param authorizationUrl - Where the SDK sends the user
     * @rejects {DevAuthorizationFlowError} When the server doesn't redirect back to the client
     */
    public async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
        this.authorizations.push(authorizationUrl);
        const signIn = new URL(authorizationUrl);
        if (this.#user !== undefined) {
            // As a user typing their name in at the dev login, which accepts any account
            signIn.searchParams.set('login_hint', this.#user);
        }
        this.callback = await followAuthorization(signIn, this.redirectUrl, {
            cookies: this.#cookies,
        });
    }

    /**
     * Takes the redirect back from the last authorization, to finish it with (`transport.finishAuth`, or the SDK's
     * `auth` with its `code`), so it's never finished twice.
     *
     * @returns Its query: `code`, `state` and `iss`, or `error`. `null` when no authorization is waiting.
     */
    public takeCallback(): URLSearchParams | null {
        const { callback } = this;
        this.callback = null;
        return callback?.searchParams ?? null;
    }

    public saveCodeVerifier(codeVerifier: string): void {
        this.#codeVerifier = codeVerifier;
    }

    public codeVerifier(): string {
        return this.#codeVerifier;
    }

    /**
     * Kept with the code verifier, so the SDK can check the authorization came back from the server it went to.
     *
     * @param state - What discovery found
     */
    public saveDiscoveryState(state: OAuthDiscoveryState): void {
        this.#discoveryState = state;
    }

    public discoveryState(): OAuthDiscoveryState | undefined {
        return this.#discoveryState;
    }
}

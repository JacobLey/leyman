import type {
    OAuthClientMetadata,
    OAuthClientProvider,
    OAuthDiscoveryState,
    StoredOAuthClientInformation,
    StoredOAuthTokens,
} from '@modelcontextprotocol/client';
import {
    Client,
    StreamableHTTPClientTransport,
    UnauthorizedError,
} from '@modelcontextprotocol/client';
import { followAuthorization } from '@leyman/demo-oauth-server';

export const agentClientId = 'demo-agent';

/**
 * A native app's loopback redirect: any port matches.
 */
export const agentRedirectUri = 'http://127.0.0.1/callback';

/**
 * An agent's OAuth client, kept in memory, as a pre-registered public client. The user's part (opening the
 * authorization URL in a browser, signing in, approving) is played by `followAuthorization`, signing in as `user`
 * (else the dev server's default account).
 */
export class AgentOAuthProvider implements OAuthClientProvider {
    public readonly redirectUrl = 'http://127.0.0.1:9/callback';
    public readonly clientMetadata: OAuthClientMetadata = {
        client_name: 'Demo agent',
        redirect_uris: [this.redirectUrl],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
    };
    /**
     * Every authorization URL the agent was sent to, in order.
     */
    public readonly authorizations: URL[] = [];
    /**
     * Where the last authorization redirected back to, with its code.
     */
    public callback: URL | null = null;
    #tokens: StoredOAuthTokens | undefined;
    #codeVerifier = '';
    #discoveryState: OAuthDiscoveryState | undefined;
    readonly #user: string | undefined;

    /**
     * @param user - Who signs in
     */
    public constructor(user?: string) {
        this.#user = user;
    }

    public clientInformation(): StoredOAuthClientInformation {
        return { client_id: agentClientId };
    }

    public tokens(): StoredOAuthTokens | undefined {
        return this.#tokens;
    }

    public saveTokens(tokens: StoredOAuthTokens): void {
        this.#tokens = tokens;
    }

    public async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
        this.authorizations.push(authorizationUrl);
        const signIn = new URL(authorizationUrl);
        if (this.#user !== undefined) {
            // As a user typing their name in at the dev server's login, which takes whoever they say
            signIn.searchParams.set('login_hint', this.#user);
        }
        this.callback = await followAuthorization(signIn, this.redirectUrl);
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

export interface Agent {
    readonly client: Client;
    readonly provider: AgentOAuthProvider;
    /**
     * Runs a request, and when it needs the user to authorize (first, or to step up), finishes the authorization
     * and runs it again: what an agent's host does when the user comes back from the browser.
     *
     * @param request - Using the client
     * @returns Its result
     */
    readonly authorized: <T>(request: () => Promise<T>) => Promise<T>;
    readonly close: () => Promise<void>;
}

/**
 * An MCP client, as an agent's host runs one, connected to the server through the OAuth flow.
 *
 * @param url - The MCP server's URL
 * @param options - Whether it speaks the 2025-era protocol (with the initialize handshake), and who signs in
 * @param options.legacy - Speaks only the 2025-era protocol
 * @param options.user - Who signs in, else the dev server's default account
 * @returns The connected agent
 */
export const connectAgent = async (
    url: string,
    options: { readonly legacy?: boolean; readonly user?: string } = {}
): Promise<Agent> => {
    const provider = new AgentOAuthProvider(options.user);
    const client = new Client(
        { name: 'demo-agent', version: '1.0.0' },
        options.legacy === true ? { versionNegotiation: { mode: 'legacy' } } : {}
    );
    let transport = new StreamableHTTPClientTransport(new URL(url), { authProvider: provider });

    const authorized = async <T>(request: () => Promise<T>): Promise<T> => {
        try {
            return await request();
        } catch (error) {
            if (!(error instanceof UnauthorizedError) || !provider.callback) {
                throw error;
            }
            const { callback } = provider;
            provider.callback = null;
            await transport.finishAuth(callback.searchParams);
            return request();
        }
    };

    await authorized(async () => {
        await client.close();
        transport = new StreamableHTTPClientTransport(new URL(url), { authProvider: provider });
        await client.connect(transport);
    });
    return { client, provider, authorized, close: async () => client.close() };
};

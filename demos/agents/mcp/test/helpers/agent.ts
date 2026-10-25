import {
    Client,
    StreamableHTTPClientTransport,
    UnauthorizedError,
} from '@modelcontextprotocol/client';
import { DevOAuthClientProvider } from 'oauth-dev-server/mcp';

export const agentClientId = 'demo-agent';

/**
 * A native app's loopback redirect: any port matches.
 */
export const agentRedirectUri = 'http://127.0.0.1/callback';

export interface Agent {
    readonly client: Client;
    readonly provider: DevOAuthClientProvider;
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
    // The user's part (opening the authorization URL in a browser, signing in, approving) is played by the dev
    // authorization server's provider
    const provider = new DevOAuthClientProvider({
        clientId: agentClientId,
        redirectUri: 'http://127.0.0.1:9/callback',
        user: options.user,
    });
    const client = new Client(
        { name: 'demo-agent', version: '1.0.0' },
        options.legacy === true ? { versionNegotiation: { mode: 'legacy' } } : {}
    );
    let transport = new StreamableHTTPClientTransport(new URL(url), { authProvider: provider });

    const authorized = async <T>(request: () => Promise<T>): Promise<T> => {
        try {
            return await request();
        } catch (error) {
            const callback = error instanceof UnauthorizedError ? provider.takeCallback() : null;
            if (!callback) {
                throw error;
            }
            await transport.finishAuth(callback);
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

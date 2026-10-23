import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ClientMetadata, Configuration, KoaContextWithOIDC } from 'oidc-provider';
import { randomBytes, randomUUID } from 'node:crypto';
import { exportJWK, generateKeyPair } from 'jose';
import OidcProvider, { errors } from 'oidc-provider';
import { DevAuthorizationServerNotLocalError } from './errors.js';

/**
 * A server that accepts this server's access tokens, as an RFC 8707 resource indicator.
 */
export interface ResourceServer {
    /**
     * Its canonical URI: the `resource` a client asks for, and the `aud` of every token issued for it.
     */
    readonly url: string;
    /**
     * Every scope it understands. A token for it carries at most these.
     */
    readonly scopes: readonly string[];
}

/**
 * A pre-registered native app (a CLI, a desktop agent): a public client, with no secret, so PKCE is what protects
 * its authorization codes. It gets refresh tokens, so it signs in once rather than every time a token expires.
 */
export interface PublicClient {
    readonly clientId: string;
    /**
     * Whether it gets refresh tokens. Without, a login lasts as long as its access token.
     *
     * @default true
     */
    readonly refreshTokens?: boolean | undefined;
    /**
     * Where an authorization may send the user back. A loopback URI (`http://127.0.0.1/callback`) matches on any
     * port, as a native app listens wherever it can (RFC 8252).
     */
    readonly redirectUris: readonly string[];
}

/**
 * A pre-registered confidential client acting for itself, never for a user: a service calling another service. It
 * authenticates with its secret, and gets tokens with the client credentials grant.
 */
export interface ServiceClient {
    readonly clientId: string;
    readonly clientSecret: string;
    /**
     * The scopes it may be granted, at most. A token carries those of them the resource understands.
     */
    readonly scopes: readonly string[];
}

export interface DevAuthorizationServerOptions {
    /**
     * Where the server is served. Its metadata, endpoints and the `iss` of every token derive from it.
     */
    readonly issuer: string;
    readonly resources: readonly ResourceServer[];
    readonly clients: readonly PublicClient[];
    readonly services: readonly ServiceClient[];
    /**
     * The one account every login signs in as. A stand-in for a real login page, so there are no passwords.
     */
    readonly accountId: string;
    /**
     * How long an access token lasts, in seconds.
     *
     * @default 600
     */
    readonly accessTokenTtl?: number | undefined;
    /**
     * Serves at an issuer that isn't this machine (`127.0.0.1`, `[::1]`, `localhost`). The server approves every
     * login, so anyone who can reach it gets tokens: never set this outside an isolated network.
     *
     * @default false
     */
    readonly dangerouslyAllowNonLocal?: boolean | undefined;
}

const localHostnames: ReadonlySet<string> = new Set(['127.0.0.1', '[::1]', 'localhost']);

/**
 * Refuses a hostname other machines could reach, unless asked for knowingly.
 *
 * @param hostname - Where the server would serve
 * @param isNonLocalAllowed - Asked for knowingly (`dangerouslyAllowNonLocal`)
 * @throws {DevAuthorizationServerNotLocalError} When the hostname isn't this machine's
 */
export const assertLocal = (hostname: string, isNonLocalAllowed = false): void => {
    if (!isNonLocalAllowed && !localHostnames.has(hostname)) {
        throw new DevAuthorizationServerNotLocalError(hostname);
    }
};

export interface DevAuthorizationServer {
    readonly issuer: string;
    /**
     * Serves every endpoint, for `node:http`'s `createServer`.
     */
    readonly listener: (request: IncomingMessage, response: ServerResponse) => void;
}

const interactionPath = /^\/interaction\/[^\/]+$/v;

const defaultAccessTokenTtl = 600;

/**
 * Bytes of randomness in the key that signs cookies.
 */
const cookieKeyBytes = 32;

/**
 * The part of Koa's context an interaction needs.
 */
interface InteractionContext {
    readonly req: IncomingMessage;
    readonly res: ServerResponse;
    readonly redirect: (url: string) => void;
}

/**
 * Finishes a login or consent prompt without asking anyone: signs in as the dev account, and grants every scope the
 * client asked for that the resource understands (oidc-provider has already dropped any it doesn't).
 *
 * @param provider - The authorization server
 * @param accountId - Who signs in
 * @param ctx - The browser's request to the interaction, redirected back to the authorization endpoint to resume
 */
const approve = async (
    provider: OidcProvider,
    accountId: string,
    ctx: InteractionContext
): Promise<void> => {
    const { req: request, res: response } = ctx;
    const { prompt, params, grantId } = await provider.interactionDetails(request, response);
    if (prompt.name === 'login') {
        ctx.redirect(await provider.interactionResult(request, response, { login: { accountId } }));
        return;
    }
    // A browser that already approved this client (and kept its session) extends that grant, e.g. to step up
    const grant =
        grantId === undefined
            ? new provider.Grant({ accountId, clientId: params.client_id as string })
            : // The grant of the session being resumed
              (await provider.Grant.find(grantId))!;
    const { missingOIDCScope, missingResourceScopes } = prompt.details as {
        readonly missingOIDCScope?: readonly string[];
        readonly missingResourceScopes?: Readonly<Record<string, readonly string[]>>;
    };
    if (missingOIDCScope) {
        grant.addOIDCScope(missingOIDCScope.join(' '));
    }
    if (missingResourceScopes) {
        const byResource = Object.entries(missingResourceScopes);
        for (const [resource, scopes] of byResource) {
            grant.addResourceScope(resource, scopes.join(' '));
        }
    }
    ctx.redirect(
        await provider.interactionResult(
            request,
            response,
            { consent: { grantId: await grant.save() } },
            { mergeWithLastSubmission: true }
        )
    );
};

/**
 * An OAuth 2.1 authorization server for development and tests, on [oidc-provider](https://github.com/panva/node-oidc-provider).
 * Everything a client sees is real: metadata discovery (RFC 8414 and OpenID Connect), the authorization code flow
 * with PKCE (S256, required), refresh tokens, the client credentials grant, resource indicators (RFC 8707), `iss` in
 * authorization responses (RFC 9207), and access tokens as JWTs (RFC 9068) signed with a key generated at startup.
 * Only the login is fake: it approves as one account, with no page and no password. It refuses to serve anywhere but
 * this machine, unless `dangerouslyAllowNonLocal` is set.
 *
 * @param options - Issuer, resources, clients and the dev account
 * @returns The server's listener
 * @rejects {DevAuthorizationServerNotLocalError} When the issuer isn't this machine, and that wasn't asked for
 */
export const createDevAuthorizationServer = async (
    options: DevAuthorizationServerOptions
): Promise<DevAuthorizationServer> => {
    const issuer = new URL(options.issuer);
    assertLocal(issuer.hostname, options.dangerouslyAllowNonLocal);
    const { privateKey } = await generateKeyPair('ES256', { extractable: true });
    const signingKey = {
        ...(await exportJWK(privateKey)),
        kid: randomUUID(),
        alg: 'ES256',
        use: 'sig',
    };
    const resources = new Map(options.resources.map(resource => [resource.url, resource]));
    const accessTokenTtl = options.accessTokenTtl ?? defaultAccessTokenTtl;

    const clients = [
        ...options.clients.map(
            (client): ClientMetadata => ({
                client_id: client.clientId,
                application_type: 'native',
                redirect_uris: [...client.redirectUris],
                token_endpoint_auth_method: 'none',
                grant_types:
                    client.refreshTokens === false
                        ? ['authorization_code']
                        : ['authorization_code', 'refresh_token'],
                response_types: ['code'],
            })
        ),
        ...options.services.map(
            (service): ClientMetadata => ({
                client_id: service.clientId,
                client_secret: service.clientSecret,
                token_endpoint_auth_method: 'client_secret_basic',
                grant_types: ['client_credentials'],
                redirect_uris: [],
                response_types: [],
                scope: service.scopes.join(' '),
            })
        ),
    ];

    const configuration: Configuration = {
        clients,
        jwks: { keys: [signingKey] },
        // Its one key is ES256, so everything it signs is
        clientDefaults: { id_token_signed_response_alg: 'ES256' },
        cookies: { keys: [randomBytes(cookieKeyBytes).toString('base64url')] },
        findAccount: (_ctx, sub) => ({ accountId: sub, claims: () => ({ sub }) }),
        scopes: [...new Set(options.resources.flatMap(resource => resource.scopes))],
        interactions: {
            url: (_ctx, interaction) => `/interaction/${interaction.uid}`,
        },
        pkce: { required: () => true },
        // Every client allowed the grant gets one, without asking for `offline_access`
        issueRefreshToken: (_ctx, client) => client.grantTypeAllowed('refresh_token'),
        features: {
            devInteractions: { enabled: false },
            clientCredentials: { enabled: true },
            resourceIndicators: {
                enabled: true,
                // A client names the server it wants a token for, in the authorization and the token request: a token
                // is never for a default audience
                // eslint-disable-next-line unicorn/no-useless-undefined -- oidc-provider reads `undefined` as "none"
                defaultResource: () => undefined,
                getResourceServerInfo: (_ctx: KoaContextWithOIDC, indicator: string) => {
                    const resource = resources.get(indicator);
                    if (!resource) {
                        throw new errors.InvalidTarget(`Unknown resource ${indicator}`);
                    }
                    return {
                        scope: resource.scopes.join(' '),
                        audience: resource.url,
                        accessTokenTTL: accessTokenTtl,
                        accessTokenFormat: 'jwt',
                        jwt: { sign: { alg: 'ES256' } },
                    };
                },
            },
        },
    };
    const provider = new OidcProvider(options.issuer, configuration);
    // The interaction route, in front of oidc-provider's own: an error thrown here is rendered as oidc-provider
    // renders its own, e.g. a 400 for an interaction whose cookie is missing or expired
    provider.use(async (ctx, next: () => Promise<void>) =>
        interactionPath.test(ctx.path) ? approve(provider, options.accountId, ctx) : next()
    );

    return { issuer: options.issuer, listener: provider.callback() };
};

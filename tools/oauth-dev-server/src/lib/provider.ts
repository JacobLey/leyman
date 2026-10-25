import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ClientMetadata, Configuration, KoaContextWithOIDC } from 'oidc-provider';
import { randomBytes, randomUUID } from 'node:crypto';
import { exportJWK, generateKeyPair } from 'jose';
import OidcProvider, { errors } from 'oidc-provider';
import { memoryAdapter } from './adapter.js';
import { DevAuthorizationServerNotLocalError } from './errors.js';
import { tokenExchange, tokenExchangeGrantType, tokenExchangeParameters } from './exchange.js';

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
     * Whether it may use the device authorization grant (RFC 8628): for a machine with no browser, the user approves
     * on another device, at a URL with a code. Off unless asked for, as a code shown on one device and entered on
     * another can be phished.
     *
     * @default false
     */
    readonly deviceAuthorization?: boolean | undefined;
    /**
     * Where an authorization may send the user back. A loopback URI (`http://127.0.0.1/callback`) matches on any
     * port, as a native app listens wherever it can (RFC 8252).
     */
    readonly redirectUris: readonly string[];
}

/**
 * A pre-registered confidential client: a service calling another service. It authenticates with its secret, and
 * gets tokens as itself with the client credentials grant, or, when it's a resource users have tokens for, as one
 * of them with the token exchange grant.
 */
export interface ServiceClient {
    readonly clientId: string;
    readonly clientSecret: string;
    /**
     * The scopes it may be granted, at most. A token carries those of them the resource understands.
     */
    readonly scopes: readonly string[];
    /**
     * Allows it the token exchange grant (RFC 8693): it may trade a user's access token issued for
     * `subjectAudience` (the service itself, as a resource: an MCP server, say) for one for another resource, as
     * that user.
     */
    readonly tokenExchange?: { readonly subjectAudience: string } | undefined;
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
     * The account a login signs in as, unless the authorization request names another (`login_hint`). A stand-in
     * for a real login page, so there are no passwords: a request is signed in as whichever account it asks for.
     */
    readonly accountId: string;
    /**
     * How long an access token lasts, in seconds.
     *
     * @default 600
     */
    readonly accessTokenTtl?: number | undefined;
    /**
     * How long a device waits between polls for its token, in seconds (the device authorization response's
     * `interval`, RFC 8628 §3.2). Shorter makes tests quicker.
     *
     * @default 5
     */
    readonly deviceInterval?: number | undefined;
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

const statusOk = 200;

/**
 * Oidc-provider's device authorization endpoint (`routes.device_authorization`, left as its default).
 */
const deviceAuthorizationPath = '/device/auth';

const interactionPath = /^\/interaction\/[^\/]+$/v;

const defaultAccessTokenTtl = 600;

/**
 * RFC 8628 §3.2's default.
 */
const defaultDeviceInterval = 5;

const deviceCodeGrantType = 'urn:ietf:params:oauth:grant-type:device_code';

/**
 * How long a user has to finish a login: an interaction, or approving a device's code. In seconds.
 */
const loginTtl = 600;

/**
 * How long a login lasts, in seconds: its session, its grant and its refresh tokens. Longer than any test or dev
 * session, and the server restarting ends it anyway.
 */
const sessionTtl = 86_400;

/**
 * A page for the device flow, with nothing but what it says and its form: the dev login has no styling to match.
 *
 * @param text - What it says
 * @param form - oidc-provider's form, and its submit button
 * @returns The HTML
 */
const devicePage = (text: string, form = ''): string =>
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dev login</title></head><body><p>${text}</p>${form}</body></html>`;

/**
 * Escapes text for HTML.
 *
 * @param text - Any text, e.g. an error's description, which may echo the request
 * @returns The text, safe in an element
 */
const escapeHtml = (text: string): string =>
    text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');

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
 * Finishes a login or consent prompt without asking anyone: signs in as the account the request hints at
 * (`login_hint`), else the dev account, and grants every scope the client asked for that the resource understands
 * (oidc-provider has already dropped any it doesn't).
 *
 * @param provider - The authorization server
 * @param accountId - Who signs in, unless the request says
 * @param ctx - The browser's request to the interaction, redirected back to the authorization endpoint to resume
 */
const approve = async (
    provider: OidcProvider,
    accountId: string,
    ctx: InteractionContext
): Promise<void> => {
    const { req: request, res: response } = ctx;
    const { prompt, params, grantId, session } = await provider.interactionDetails(
        request,
        response
    );
    if (prompt.name === 'login') {
        const { login_hint: hint } = params;
        ctx.redirect(
            await provider.interactionResult(request, response, {
                login: { accountId: typeof hint === 'string' ? hint : accountId },
            })
        );
        return;
    }
    // A browser that already approved this client (and kept its session) extends that grant, e.g. to step up
    const grant =
        grantId === undefined
            ? // Consent comes after a login, so there's a session
              new provider.Grant({
                  accountId: session!.accountId,
                  clientId: params.client_id as string,
              })
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
 * with PKCE (S256, required), refresh tokens, the client credentials, device authorization (RFC 8628) and token
 * exchange (RFC 8693) grants, resource
 * indicators (RFC 8707), `iss` in authorization responses (RFC 9207), revocation (RFC 7009), and access tokens as JWTs
 * (RFC 9068) signed with a key generated at startup.
 * Only the login is fake: it approves as the account asked for, with no page and no password. It refuses to serve anywhere but
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
    const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
    const kid = randomUUID();
    const signingKey = {
        ...(await exportJWK(privateKey)),
        kid,
        alg: 'ES256',
        use: 'sig',
    };
    const resources = new Map(options.resources.map(resource => [resource.url, resource]));
    const accessTokenTtl = options.accessTokenTtl ?? defaultAccessTokenTtl;
    const deviceInterval = options.deviceInterval ?? defaultDeviceInterval;

    const clients = [
        ...options.clients.map(
            (client): ClientMetadata => ({
                client_id: client.clientId,
                application_type: 'native',
                redirect_uris: [...client.redirectUris],
                token_endpoint_auth_method: 'none',
                grant_types: [
                    'authorization_code',
                    ...(client.refreshTokens === false ? [] : ['refresh_token']),
                    ...(client.deviceAuthorization === true ? [deviceCodeGrantType] : []),
                ],
                response_types: ['code'],
            })
        ),
        ...options.services.map(
            (service): ClientMetadata => ({
                client_id: service.clientId,
                client_secret: service.clientSecret,
                token_endpoint_auth_method: 'client_secret_basic',
                grant_types: service.tokenExchange
                    ? ['client_credentials', tokenExchangeGrantType]
                    : ['client_credentials'],
                redirect_uris: [],
                response_types: [],
                scope: service.scopes.join(' '),
            })
        ),
    ];

    const configuration: Configuration = {
        clients,
        // Kept in this process, like everything else here
        adapter: memoryAdapter,
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
        ttl: {
            AccessToken: accessTokenTtl,
            ClientCredentials: accessTokenTtl,
            // Only with the `openid` scope
            IdToken: accessTokenTtl,
            DeviceCode: loginTtl,
            Interaction: loginTtl,
            Session: sessionTtl,
            Grant: sessionTtl,
            RefreshToken: sessionTtl,
        },
        // Its clients are native apps and services, neither of which calls from a browser. Discovery and the JWKS
        // are open to every origin regardless
        clientBasedCORS: () => false,
        // An error in a browser (a bad authorization request, say), as plain as the device pages
        renderError: (ctx, out) => {
            ctx.type = 'html';
            ctx.body = devicePage(
                Object.entries(out)
                    .map(([name, value]) => `${name}: ${escapeHtml(String(value))}`)
                    .join('<br>')
            );
        },
        // Every client allowed the grant gets one, without asking for `offline_access`
        issueRefreshToken: (_ctx, client) => client.grantTypeAllowed('refresh_token'),
        features: {
            devInteractions: { enabled: false },
            // A login is never ended early: its session lasts until it expires, or the server restarts
            rpInitiatedLogout: { enabled: false },
            clientCredentials: { enabled: true },
            deviceFlow: {
                enabled: true,
                userCodeInputSource: (ctx, form, _out, error) => {
                    ctx.body = devicePage(
                        error ? 'That code is not right.' : 'Enter the code your device shows.',
                        `${form}<button type="submit" form="op.deviceInputForm">Continue</button>`
                    );
                },
                // The page shown at `verification_uri_complete`: confirming the code is theirs is
                // what stops a phished code being approved unseen, so it's kept, even in the dev login
                userCodeConfirmSource: (ctx, form, _client, _deviceInfo, userCode) => {
                    ctx.body = devicePage(
                        `Is your device showing ${userCode}?`,
                        `${form}<button type="submit" form="op.deviceConfirmForm">Yes</button>` +
                            '<button type="submit" form="op.deviceConfirmForm" name="abort" value="yes">No</button>'
                    );
                },
                successSource: ctx => {
                    ctx.body = devicePage('Signed in. You can close this page.');
                },
            },
            // RFC 7009: a client gives up a refresh token, and with it the grant (every token issued under it).
            // Access tokens are JWTs, which resource servers verify without calling back, so they can't be revoked
            revocation: {
                enabled: true,
                // A client revokes only its own tokens
                allowedPolicy: (_ctx, client, token) => token.clientId === client.clientId,
            },
            resourceIndicators: {
                enabled: true,
                // A client sends the resource server it wants a token for in the authorization and the token request.
                // There is no default audience
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
                        accessTokenFormat: 'jwt',
                        jwt: { sign: { alg: 'ES256' } },
                    };
                },
            },
        },
    };
    const provider = new OidcProvider(options.issuer, configuration);
    const services = new Map(options.services.map(service => [service.clientId, service]));
    provider.registerGrantType(
        tokenExchangeGrantType,
        tokenExchange({
            issuer: options.issuer,
            keys: { privateKey, publicKey, kid },
            accessTokenTtl,
            resources,
            services,
        }),
        tokenExchangeParameters
    );
    // Oidc-provider names no `interval`, which then means 5 seconds
    provider.use(async (ctx, downstream: () => Promise<void>) => {
        await downstream();
        if (ctx.path === deviceAuthorizationPath && ctx.status === statusOk) {
            (ctx.body as Record<string, unknown>).interval = deviceInterval;
        }
    });
    // The interaction route, in front of oidc-provider's own: an error thrown here is rendered as oidc-provider
    // renders its own, e.g. a 400 for an interaction whose cookie is missing or expired
    provider.use(async (ctx, next: () => Promise<void>) =>
        interactionPath.test(ctx.path) ? approve(provider, options.accountId, ctx) : next()
    );

    const handle = provider.callback();
    return {
        issuer: options.issuer,
        // Koa handles a request's errors itself (rendering them as responses), so its promise never rejects
        listener: (request, response) => {
            void handle(request, response);
        },
    };
};

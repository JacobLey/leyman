<div style="text-align:center">

# oauth-dev-server
A local OAuth 2.1 authorization server for tests: oidc-provider with a dev login, issuing audience-bound JWT access tokens through the real flow.

</div>

A real authorization server ([oidc-provider](https://github.com/panva/node-oidc-provider)) with a fake user, so tests of a client or a resource server run the same OAuth flow they would in production, with no hosted identity provider, no account and no network. Only the login page is skipped.

- **Strict, like a real provider.** Clients, redirect URIs, resources and scopes are registered up front, PKCE is required, and every token is for one resource (`aud`). A client that gets the flow wrong fails here, as it would in production.
- **The grants a native app or a service uses**: authorization code with PKCE, refresh, client credentials, device authorization (RFC 8628) and token exchange (RFC 8693), with revocation.
- **JWT access tokens** (RFC 9068), signed with a key generated at startup and verified against its JWKS, as a resource server would verify any provider's.
- **Plays the user too**: `followAuthorization` and `approveDevice` sign in as any account, with no browser.
- **Local only.** It approves every login, so it refuses to serve anywhere but this machine unless told otherwise.

Private for now: depend on it from the workspace (`"oauth-dev-server": "workspace:^"`). Runner-agnostic: plain functions, and a server to close.

## Contents
- [Example](#example)
- [API](#api)
  - [listenDevAuthorizationServer](#listendevauthorizationserveroptions)
  - [createDevAuthorizationServer](#createdevauthorizationserveroptions)
  - [followAuthorization](#followauthorizationauthorizationurl-redirecturi-options)
  - [approveDevice](#approvedeviceverificationuri-options)
  - [Errors](#errors)
- [Clients](#clients)
- [What's real](#whats-real)
- [What's fake](#whats-fake)
- [Replacing it](#replacing-it)
- [Notes on oidc-provider](#notes-on-oidc-provider)
- [Not covered](#not-covered)
- [Compared to alternatives](#compared-to-alternatives)

## Example

```ts
import { approveDevice, followAuthorization, listenDevAuthorizationServer } from 'oauth-dev-server';

const server = await listenDevAuthorizationServer({
    // Who accepts its tokens, and with which scopes
    resources: [{ url: 'http://127.0.0.1:3000', scopes: ['files:read', 'files:write'] }],
    // A native app (CLI, agent): public, PKCE, refresh tokens, loopback redirect on any port
    // and, with `deviceAuthorization`, the device grant for a machine with no browser
    clients: [
        {
            clientId: 'files-cli',
            redirectUris: ['http://127.0.0.1/callback'],
            deviceAuthorization: true,
        },
    ],
    // A service: client credentials as itself, and (being a resource itself) token exchange as a user
    services: [
        {
            clientId: 'files-gateway',
            clientSecret: 'secret',
            scopes: ['files:read'],
            tokenExchange: { subjectAudience: 'http://127.0.0.1:3001' },
        },
    ],
    // A login signs in as this account, unless it names another (`login_hint`)
    accountId: 'dev-user',
});

server.issuer; // http://127.0.0.1:<port>, also where its metadata is

// In a test, play the user's browser: sign in, approve, and get the redirect back to the client
const callback = await followAuthorization(authorizationUrl, 'http://127.0.0.1:8123/callback');
callback.searchParams.get('code');

// Or the user approving a device login on another device, at the URL the device shows
await approveDevice(verificationUriComplete);

await server.close();
```

## API

### `listenDevAuthorizationServer(options)`

Starts a server on `node:http`, its issuer being wherever it listens.

**Returns** `Promise<ListeningAuthorizationServer>`: `{ issuer, close }`. `close()` stops listening and ends open connections.

**Rejects** with `DevAuthorizationServerNotLocalError` when `hostname` isn't this machine, before listening.

#### Options

Those of [`createDevAuthorizationServer`](#createdevauthorizationserveroptions) but `issuer`, plus:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | `number` | `0` | Port to listen on. `0` is any free port. |
| `hostname` | `string` | `'127.0.0.1'` | Where to listen: `127.0.0.1`, `[::1]` or `localhost`, unless `dangerouslyAllowNonLocal`. |

### `createDevAuthorizationServer(options)`

Builds the server as a `node:http` listener, for a server you already have.

**Returns** `Promise<DevAuthorizationServer>`: `{ issuer, listener }`.

**Rejects** with `DevAuthorizationServerNotLocalError` when the issuer isn't this machine.

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `issuer` | `string` | — | Required. Where it's served: its metadata, endpoints and every token's `iss` derive from it. |
| `resources` | `ResourceServer[]` | — | Required. `{ url, scopes }`: each server that accepts its tokens (RFC 8707), and every scope it understands. `url` is the `resource` a client asks for, and the `aud` of tokens for it. |
| `clients` | `PublicClient[]` | — | Required. Native apps, see [Clients](#clients). |
| `services` | `ServiceClient[]` | — | Required. Confidential clients, see [Clients](#clients). |
| `accountId` | `string` | — | Required. The account a login signs in as, unless the authorization request names another (`login_hint`). |
| `accessTokenTtl` | `number` | `600` | How long an access token lasts, in seconds. |
| `deviceInterval` | `number` | `5` | Seconds a device waits between polls (the device authorization response's `interval`). `1` makes tests quicker. |
| `dangerouslyAllowNonLocal` | `boolean` | `false` | Serve at an issuer other machines can reach. Anyone who can reach it gets tokens: only in an isolated network. |

### `followAuthorization(authorizationUrl, redirectUri, options?)`

Plays the user's browser for an authorization request: follows the server's redirects, keeping its cookies, through the dev login and consent, until it redirects to the client's redirect URI. That redirect isn't fetched.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `authorizationUrl` | `string \| URL` | — | Required. Where the client sends the user, with its `client_id`, PKCE challenge and `resource`. |
| `redirectUri` | `string \| URL` | — | Required. The client's redirect URI. Only its origin and path are compared. |
| `options.cookies` | `Map<string, string>` | a new jar | The browser's cookies, kept like a browser profile: a second authorization resumes the session (no login) and extends its grant, as when a client steps up to more scopes. Updated as the server sets them. |

**Returns** `Promise<URL>`: the redirect, with `code`, `state` and `iss` (or `error`) in its query.

**Rejects** with `DevAuthorizationFlowError` when the server answers anything but a redirect (an unknown client or redirect URI), or redirects more than 10 times.

### `approveDevice(verificationUri, options?)`

Plays the user on another device for the device authorization grant: opens the `verification_uri_complete` the device shows, posts the code, confirms it's the one shown, and signs in. The device's next poll gets its tokens.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `verificationUri` | `string \| URL` | — | Required. The device authorization response's `verification_uri_complete`. |
| `options.deny` | `boolean` | `false` | Say the code isn't the one shown: the device is refused (`access_denied`). |
| `options.cookies` | `Map<string, string>` | a new jar | As for `followAuthorization`. |

**Returns** `Promise<void>`

**Rejects** with `DevAuthorizationFlowError` when the server refuses the code, shows no form, or doesn't finish.

### Errors

Every error extends `DevAuthorizationError`. The types `ListenOptions`, `ListeningAuthorizationServer`, `DevAuthorizationServerOptions`, `DevAuthorizationServer`, `ResourceServer`, `PublicClient`, `ServiceClient`, `FollowAuthorizationOptions` and `ApproveDeviceOptions` are exported too.

| Error | When |
|-------|------|
| `DevAuthorizationServerNotLocalError` | It would serve where other machines can reach it. Has `hostname`. |
| `DevAuthorizationFlowError` | `followAuthorization` or `approveDevice` didn't finish. Has `url`, the last URL fetched. |

## Clients

| | Public client (`clients`) | Service (`services`) |
|---|---|---|
| For | A CLI, a desktop agent: runs on the user's machine, so it can't keep a secret | A server calling another server as itself |
| Options | `clientId`, `redirectUris`, `refreshTokens?`, `deviceAuthorization?` | `clientId`, `clientSecret`, `scopes`, `tokenExchange?` |
| Grant | Authorization code + PKCE, then refresh token; device authorization, with `deviceAuthorization` | Client credentials; token exchange, with `tokenExchange` |
| Authenticates with | Nothing (PKCE protects the code) | Its secret (HTTP Basic) |
| Redirect | Loopback, any port (RFC 8252): `http://127.0.0.1/callback` matches every port | None |
| Token's subject | The user who logged in | The client itself (`sub` is its `client_id`, RFC 9068); the user, when exchanged |

A public client may opt out of refresh tokens (`refreshTokens: false`): its login then lasts as long as one access token. It may opt in to the device grant (`deviceAuthorization: true`), which is off by default: a device code can be phished (someone starts a login, and asks you to approve their code), so a client should have it only when it runs where there's no browser.

A service's `scopes` are the most it may be granted. `tokenExchange: { subjectAudience }` lets it trade a user's token issued for `subjectAudience` (the service itself, as a resource) for one for another resource, as that user.

A resource server should tell a service's own token from a user's: both have a `sub`, and a service's is its `client_id`.

## What's real

- **Discovery**: metadata at `/.well-known/oauth-authorization-server` (RFC 8414) and `/.well-known/openid-configuration`.
- **Authorization code flow with PKCE**, S256 only, required for every client.
- **Resource indicators** (RFC 8707): a client sends the server a token is for in the authorization and the token request. There is no default audience: a token is never valid everywhere.
- **JWT access tokens** (RFC 9068, `typ: at+jwt`), with `aud`, `scope` and `client_id`, signed with an ES256 key generated at startup. A resource server verifies them against the issuer's JWKS, without calling back.
- **`iss` in authorization responses** (RFC 9207), so a client can tell which server answered.
- **Refresh tokens** for native apps, and the **client credentials grant** for services.
- **The device authorization grant** (RFC 8628) for native apps that opt in: the user approves at `/device` on another device, confirming the code the device shows. The response sets the poll `interval`.
- **Token exchange** (RFC 8693) for a service that is itself a resource: it trades a user's token issued for it for one for a resource it calls, as the same user (`sub`), with `act` identifying the service (§4.1). The new token has at most the scopes the user granted, the resource understands and the service may have, never outlives the token it came from, and is signed like every other, so a resource server can't tell them apart. A token issued for anything but the service itself is refused (`invalid_grant`).
- **Revocation** (RFC 7009) of refresh tokens: revoking one revokes the grant it came from, and every refresh token issued under it. A client revokes only its own. Access tokens can't be revoked (`unsupported_token_type`): they're JWTs, which resource servers check without calling back, so a revoked login's access tokens stay good until they expire.
- **Scopes per resource**: a token carries only scopes its resource understands, and a service only those it's registered for (asking for more is `invalid_scope`).

## What's fake

- **The login.** There's no login page: the interaction route signs in as the account given in the authorization request (`login_hint`), else `accountId`, and grants what was asked for. It signs in as any account asked for, which tests of per-user data need, and is why it must never be reachable.
- **The storage.** oidc-provider's in-memory adapter (it warns about it on start): restart it and every grant and refresh token is gone.
- **The keys and cookie secret**, generated at startup.
- **The device pages** (enter the code, confirm it, done): plain HTML, a sentence and a form each.

## Replacing it

A client or resource server tested against it depends on nothing here but URLs and standards: an issuer, its metadata, and the JWTs it signs. Moving to Keycloak or a hosted provider means registering the same clients, resources and scopes there and pointing the issuer at it, provided the provider issues what the verifier expects. Not every one does by default:

- **RFC 9068 access tokens** (`typ: at+jwt`), with `scope` as a space-separated string and `client_id`. Keycloak sends `typ: JWT` unless a client opts in, Entra and Okta put scopes in `scp`, and Keycloak puts the client in `azp` on users' tokens.
- **Token exchange** (RFC 8693): Keycloak 26.2+ supports it, Okta does, and Entra has its own on-behalf-of flow instead.
- **Resource indicators** (RFC 8707), so `aud` is the server the token is for. Experimental in Keycloak 26.x; elsewhere `aud` comes from configured audience mappers, and client credentials may ignore `resource`.
- **Discovery** at `/.well-known/openid-configuration` appended to the issuer, and the authorization server's metadata.
- **Loopback redirects on any port** (RFC 8252) for native clients, which providers support unevenly.

## Notes on oidc-provider

What building it on oidc-provider took, for anyone configuring it themselves:

- **It signs ID tokens with RS256 by default**, and refuses a client when the only key is ES256: `clientDefaults.id_token_signed_response_alg` has to say ES256.
- **Its interaction route is Koa middleware.** Answering there (`provider.use`) rather than in front of its listener means an error (an expired interaction, a missing cookie) is rendered as oidc-provider renders its own, e.g. a 400.
- **Client credentials asking for a scope the client isn't registered for fails** (`invalid_scope`), where the authorization code flow drops the scopes a resource doesn't understand.
- **A token from client credentials has a `sub`**: the client's id (RFC 9068).
- **It has no token exchange**, but registers custom grants (`registerGrantType`): it authenticates the client, checks it's allowed the grant, and resolves `resource` (refusing one it doesn't know) before the handler runs. A grant type the client isn't allowed is `invalid_request`, where RFC 6749 says `unauthorized_client`.
- **Its JWT access tokens can't be minted outside a grant it runs**, so exchanged tokens are signed with `jose` and the same key, with the claims it would give (`typ: at+jwt`, `iss`, `sub`, `aud`, `client_id`, `scope`, `jti`).
- **Its device authorization response names no `interval`**, which means 5 seconds to a client, so this server adds one. And **`verification_uri_complete` doesn't skip the code**: it opens a form, filled in, that posts itself (a browser's script does it), and then asks the user to confirm.
- **Client ID Metadata Documents** need an `https` client id, which a local test can't serve, so clients here are pre-registered.

## Not covered

- A login page, consent screen, accounts, or any user store.
- Persistence (a database adapter), key rotation, and several instances.
- Dynamic Client Registration and Client ID Metadata Documents.
- Token introspection, and so revoking access tokens.
- DPoP (sender-constrained tokens).

## Compared to alternatives

- [oauth2-mock-server](https://www.npmjs.com/package/oauth2-mock-server) (Node.js) and [navikt's mock-oauth2-server](https://github.com/navikt/mock-oauth2-server) (JVM, or a container) are lenient by design: they issue tokens for any client and request, and let a test shape the tokens. Good for testing a resource server's checks; a client that gets the flow wrong still passes. oauth-dev-server is the opposite trade: a real provider's checks, with less control over what it signs.
- Keycloak in a container is the real thing, with its configuration to keep in step and a JVM to start; see [Replacing it](#replacing-it).

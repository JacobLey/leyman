# demo-oauth-server

A development authorization server on [oidc-provider](https://github.com/panva/node-oidc-provider): a real OAuth 2.1 flow, with a fake user.

A worked example, not a package: it is never published. Other demos log in through it (the [notes API](../openapi), its [MCP server and CLI](../agents)), so their tests run the same OAuth flow a deployed client would, with no hosted identity provider, no account and no network. Everything a client sees is real; only the login page is skipped.

## Contents
- [Example](#example)
- [What's real](#whats-real)
- [What's fake](#whats-fake)
- [Clients](#clients)
- [Replacing it](#replacing-it)
- [What was learned](#what-was-learned)
- [Not covered](#not-covered)

## Example

```ts
import { followAuthorization, listenDevAuthorizationServer } from '@leyman/demo-oauth-server';

const server = await listenDevAuthorizationServer({
    // Who accepts its tokens, and with which scopes
    resources: [{ url: 'http://127.0.0.1:3000', scopes: ['notes:read', 'notes:write'] }],
    // A native app (CLI, agent): public, PKCE, refresh tokens, loopback redirect on any port
    clients: [{ clientId: 'notes-cli', redirectUris: ['http://127.0.0.1/callback'] }],
    // A service acting as itself: client credentials
    services: [{ clientId: 'notes-mcp', clientSecret: 'secret', scopes: ['notes:read'] }],
    // Every login signs in as this account
    accountId: 'dev-user',
});

server.issuer; // http://127.0.0.1:<port>, also where its metadata is

// In a test, play the user's browser: sign in, approve, and get the redirect back to the client
const callback = await followAuthorization(authorizationUrl, 'http://127.0.0.1:8123/callback');
callback.searchParams.get('code');

await server.close();
```

`createDevAuthorizationServer({ issuer, ... })` returns a `node:http` listener instead, for a server you already have.

`followAuthorization` starts each authorization with an empty cookie jar, unless given one (`{ cookies }`) to keep like a browser profile: a second authorization then resumes the session (no login) and extends its grant, as when a client steps up to more scopes.

## What's real

- **Discovery**: metadata at `/.well-known/oauth-authorization-server` (RFC 8414) and `/.well-known/openid-configuration`.
- **Authorization code flow with PKCE**, S256 only, required for every client.
- **Resource indicators** (RFC 8707): a client names the server a token is for, in the authorization and the token request. There is no default audience: a token is never valid everywhere.
- **JWT access tokens** (RFC 9068, `typ: at+jwt`), with `aud`, `scope` and `client_id`, signed with an ES256 key generated at startup. A resource server verifies them against the issuer's JWKS, without calling back.
- **`iss` in authorization responses** (RFC 9207), so a client can tell which server answered.
- **Refresh tokens** for native apps, and the **client credentials grant** for services.
- **Scopes per resource**: a token carries only scopes its resource understands, and a service only those it's registered for (asking for more is `invalid_scope`).

## What's fake

- **The login.** There's no login page: the interaction route signs in as `accountId` and grants what was asked for. A browser (or `followAuthorization`) goes straight through the redirects.
- **The storage.** oidc-provider's in-memory adapter (it warns about it on start): restart it and every grant and refresh token is gone.
- **The keys and cookie secret**, generated at startup.

It refuses to serve anywhere but this machine (`127.0.0.1`, `[::1]`, `localhost`): `listenDevAuthorizationServer({ hostname: '0.0.0.0' })` or a non-local issuer throws `DevAuthorizationServerNotLocalError`, unless `dangerouslyAllowNonLocal: true` says it's meant (an isolated network, say). Anyone who can reach it gets tokens.

## Clients

| | Public client (`clients`) | Service (`services`) |
|---|---|---|
| For | A CLI, a desktop agent: runs on the user's machine, so it can't keep a secret | A server calling another server as itself |
| Grant | Authorization code + PKCE, then refresh token | Client credentials |
| Authenticates with | Nothing (PKCE protects the code) | Its secret (HTTP Basic) |
| Redirect | Loopback, any port (RFC 8252) | None |
| Token's subject | The user (`accountId`) | The client itself |

A public client may opt out of refresh tokens (`refreshTokens: false`): its login then lasts as long as one access token.

## Replacing it

The other demos depend on nothing here but URLs and standards: an issuer, its metadata, and the JWTs it signs. Replacing it with Keycloak (as a devcontainer sidecar) or a hosted provider means registering the same clients, resources and scopes there, and pointing the issuer at it, provided the provider issues what the verifiers expect. Not every one does by default:

- **RFC 9068 access tokens** (`typ: at+jwt`), with `scope` as a space-separated string and `client_id`. Keycloak sends `typ: JWT` unless a client opts in, Entra and Okta put scopes in `scp`, and Keycloak puts the client in `azp` on users' tokens.
- **Resource indicators** (RFC 8707), so `aud` is the server the token is for. Experimental in Keycloak 26.x; elsewhere `aud` comes from configured audience mappers, and client credentials may ignore `resource`.
- **Discovery** at `/.well-known/openid-configuration` appended to the issuer (the verifiers), and the authorization server's metadata (the CLI).
- **Loopback redirects on any port** (RFC 8252) for native clients, which providers support unevenly.

Where a provider differs, the verifier (an `Authenticator`, or the MCP server's `OAuthTokenVerifier`) is the one binding to change.

## What was learned

- **oidc-provider signs ID tokens with RS256 by default**, and refuses a client when the only key is ES256: `clientDefaults.id_token_signed_response_alg` has to say ES256.
- **Its interaction route is Koa middleware.** Answering there (`provider.use`) rather than in front of its listener means an error (an expired interaction, a missing cookie) is rendered as oidc-provider renders its own, e.g. a 400.
- **Client credentials asking for a scope the client isn't registered for fails** (`invalid_scope`), where the authorization code flow drops the scopes a resource doesn't understand.
- **A token from client credentials has a `sub`**: the client's id (RFC 9068).
- **Client ID Metadata Documents** (the MCP spec's preferred registration) need an `https` client id, which a local test can't serve, so clients here are pre-registered.

## Not covered

- A login page, consent screen, accounts, or any user store.
- Persistence (a database adapter), key rotation, and several instances.
- Dynamic Client Registration and Client ID Metadata Documents.
- Token revocation and introspection (both supported by oidc-provider, not configured).
- DPoP (sender-constrained tokens).

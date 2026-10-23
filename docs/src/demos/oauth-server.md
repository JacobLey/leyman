---
description: oidc-provider as a local authorization server - the real OAuth 2.1 flow (PKCE, resource indicators, JWT access tokens, refresh, client credentials, token exchange) with a fake login, so other demos test their auth end to end.
---

# Dev OAuth server

**Source:** [`demos/oauth-server`](https://github.com/JacobLey/leyman/tree/main/demos/oauth-server)

A development authorization server on [oidc-provider](https://github.com/panva/node-oidc-provider): a real OAuth 2.1 flow, with a fake user.

A worked example, not a package: it is never published. Other demos log in through it (the [notes API](/demos/openapi), its [MCP server and CLI](/demos/agents)), so their tests run the same OAuth flow a deployed client would, with no hosted identity provider, no account and no network. Everything a client sees is real; only the login page is skipped.

## Example

```ts
declare const authorizationUrl: URL;
declare const verificationUriComplete: string;
// ---cut---
import { approveDevice, followAuthorization, listenDevAuthorizationServer } from '@leyman/demo-oauth-server';

const server = await listenDevAuthorizationServer({
    // Who accepts its tokens, and with which scopes
    resources: [{ url: 'http://127.0.0.1:3000', scopes: ['notes:read', 'notes:write'] }],
    // A native app (CLI, agent): public, PKCE, refresh tokens, loopback redirect on any port
    // and, with `deviceAuthorization`, the device grant for a machine with no browser
    clients: [
        {
            clientId: 'notes-cli',
            redirectUris: ['http://127.0.0.1/callback'],
            deviceAuthorization: true,
        },
    ],
    // A service: client credentials as itself, and (being a resource itself) token exchange as a user
    services: [
        {
            clientId: 'notes-mcp',
            clientSecret: 'secret',
            scopes: ['notes:read'],
            tokenExchange: { subjectAudience: 'http://127.0.0.1:3001/mcp' },
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

`createDevAuthorizationServer({ issuer, ... })` returns a `node:http` listener instead, for a server you already have.

`approveDevice(verificationUriComplete, { deny })` plays the user on the other device: it posts the code, confirms it's the one shown (or, with `deny`, says it isn't, so the device is refused with `access_denied`), and signs in. The device's next poll gets its tokens.

`followAuthorization` starts each authorization with an empty cookie jar, unless given one (`{ cookies }`) to keep like a browser profile: a second authorization then resumes the session (no login) and extends its grant, as when a client steps up to more scopes.

## What's real

- **Discovery**: metadata at `/.well-known/oauth-authorization-server` (RFC 8414) and `/.well-known/openid-configuration`.
- **Authorization code flow with PKCE**, S256 only, required for every client.
- **Resource indicators** (RFC 8707): a client names the server a token is for, in the authorization and the token request. There is no default audience: a token is never valid everywhere.
- **JWT access tokens** (RFC 9068, `typ: at+jwt`), with `aud`, `scope` and `client_id`, signed with an ES256 key generated at startup. A resource server verifies them against the issuer's JWKS, without calling back.
- **`iss` in authorization responses** (RFC 9207), so a client can tell which server answered.
- **Refresh tokens** for native apps, and the **client credentials grant** for services.
- **The device authorization grant** (RFC 8628) for native apps that opt in (`deviceAuthorization: true`): the user approves at `/device` on another device, confirming the code the device shows. The response names the poll `interval` (`deviceInterval`, 5 seconds by default; a test can make it 1).
- **Token exchange** (RFC 8693) for a service that is itself a resource (an MCP server): it trades a user's token issued for it for one for a resource it calls, as the same user (`sub`), with `act` naming the service (§4.1). The new token has at most the scopes the user granted, the resource understands and the service may have, never outlives the token it came from, and is signed like every other, so a resource server can't tell them apart. A token issued for anything but the service itself is refused (`invalid_grant`): a service exchanges only what was meant for it.
- **Revocation** (RFC 7009) of refresh tokens: revoking one revokes the grant it came from, and every refresh token issued under it. A client revokes only its own. Access tokens can't be revoked (`unsupported_token_type`): they're JWTs, which resource servers check without calling back, so a revoked login's access tokens stay good until they expire (10 minutes, by default).
- **Scopes per resource**: a token carries only scopes its resource understands, and a service only those it's registered for (asking for more is `invalid_scope`).

## What's fake

- **The login.** There's no login page: the interaction route signs in as the account the authorization request names (`login_hint`), else `accountId`, and grants what was asked for. A browser (or `followAuthorization`) goes straight through the redirects. Whoever asks is whoever they say, which is what tests of per-user data need, and why it must never be reachable.
- **The storage.** oidc-provider's in-memory adapter (it warns about it on start): restart it and every grant and refresh token is gone.
- **The keys and cookie secret**, generated at startup.
- **The device pages** (enter the code, confirm it, done): plain HTML, a sentence and a form each.

It refuses to serve anywhere but this machine (`127.0.0.1`, `[::1]`, `localhost`): `listenDevAuthorizationServer({ hostname: '0.0.0.0' })` or a non-local issuer throws `DevAuthorizationServerNotLocalError`, unless `dangerouslyAllowNonLocal: true` says it's meant (an isolated network, say). Anyone who can reach it gets tokens.

## Clients

| | Public client (`clients`) | Service (`services`) |
|---|---|---|
| For | A CLI, a desktop agent: runs on the user's machine, so it can't keep a secret | A server calling another server as itself |
| Grant | Authorization code + PKCE, then refresh token; device authorization, with `deviceAuthorization` | Client credentials; token exchange, with `tokenExchange` |
| Authenticates with | Nothing (PKCE protects the code) | Its secret (HTTP Basic) |
| Redirect | Loopback, any port (RFC 8252) | None |
| Token's subject | The user who logged in | The client itself; the user, when exchanged |

A public client may opt out of refresh tokens (`refreshTokens: false`): its login then lasts as long as one access token. It may opt in to the device grant (`deviceAuthorization: true`), which is off by default: a device code can be phished (someone starts a login, and asks you to approve their code), so a client should have it only when it runs where there's no browser.

## Replacing it

The other demos depend on nothing here but URLs and standards: an issuer, its metadata, and the JWTs it signs. Replacing it with Keycloak (as a devcontainer sidecar) or a hosted provider means registering the same clients, resources and scopes there, and pointing the issuer at it, provided the provider issues what the verifiers expect. Not every one does by default:

- **RFC 9068 access tokens** (`typ: at+jwt`), with `scope` as a space-separated string and `client_id`. Keycloak sends `typ: JWT` unless a client opts in, Entra and Okta put scopes in `scp`, and Keycloak puts the client in `azp` on users' tokens.
- **Token exchange** (RFC 8693), if a service calls on as the user: Keycloak 26.2+ supports it, Okta does, and Entra has its own on-behalf-of flow instead.
- **Resource indicators** (RFC 8707), so `aud` is the server the token is for. Experimental in Keycloak 26.x; elsewhere `aud` comes from configured audience mappers, and client credentials may ignore `resource`.
- **Discovery** at `/.well-known/openid-configuration` appended to the issuer (the verifiers), and the authorization server's metadata (the CLI).
- **Loopback redirects on any port** (RFC 8252) for native clients, which providers support unevenly.

Where a provider differs, the verifier (an `Authenticator`, or the MCP server's `OAuthTokenVerifier`) is the one binding to change.

## What was learned

- **oidc-provider signs ID tokens with RS256 by default**, and refuses a client when the only key is ES256: `clientDefaults.id_token_signed_response_alg` has to say ES256.
- **Its interaction route is Koa middleware.** Answering there (`provider.use`) rather than in front of its listener means an error (an expired interaction, a missing cookie) is rendered as oidc-provider renders its own, e.g. a 400.
- **Client credentials asking for a scope the client isn't registered for fails** (`invalid_scope`), where the authorization code flow drops the scopes a resource doesn't understand.
- **A token from client credentials has a `sub`**: the client's id (RFC 9068).
- **oidc-provider has no token exchange**, but registers custom grants (`registerGrantType`): it authenticates the client, checks it's allowed the grant, and resolves `resource` (refusing one it doesn't know) before the handler runs. A grant type the client isn't allowed is `invalid_request`, where RFC 6749 says `unauthorized_client`.
- **Its JWT access tokens can't be minted outside a grant it runs**, so exchanged tokens are signed with `jose` and the same key, with the claims it would give (`typ: at+jwt`, `iss`, `sub`, `aud`, `client_id`, `scope`, `jti`).
- **oidc-provider's device authorization response names no `interval`**, which means 5 seconds to a client, so the dev server adds one. And **`verification_uri_complete` doesn't skip the code**: it opens a form, filled in, that posts itself (a browser's script does it), and then asks the user to confirm.
- **Client ID Metadata Documents** (the MCP spec's preferred registration) need an `https` client id, which a local test can't serve, so clients here are pre-registered.

## Not covered

- A login page, consent screen, accounts, or any user store.
- Persistence (a database adapter), key rotation, and several instances.
- Dynamic Client Registration and Client ID Metadata Documents.
- Token introspection (supported by oidc-provider, not configured), and so revoking access tokens.
- DPoP (sender-constrained tokens).

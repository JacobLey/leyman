# demo-agents-mcp

An MCP server over the notes API: tools shaped for agents, an OAuth resource server, and its own credentials for the API it calls.

Part of the [agents demo](../README.md). A worked example, never published.

## Contents
- [Example](#example)
- [Tools](#tools)
- [Mapping onto the API](#mapping-onto-the-api)
- [Keeping agents' context small](#keeping-agents-context-small)
- [Authorization](#authorization)
- [The server's own credentials](#the-servers-own-credentials)
- [Transport](#transport)
- [Composing with haywire](#composing-with-haywire)
- [Testing](#testing)
- [What was learned](#what-was-learned)
- [Not covered](#not-covered)

## Example

```ts
import { serve } from '@hono/node-server';
import { createNotesMcpApp } from '@leyman/demo-agents-mcp';

const app = createNotesMcpApp({
    // Where it is served: agents' tokens must be issued for exactly this
    resourceUrl: 'https://notes.example/mcp',
    // Who agents get tokens from
    issuer: 'https://auth.example',
    // Host and Origin it answers to, against DNS rebinding
    allowedHosts: ['notes.example'],
    // The notes API, and the server's own credentials for it
    api: {
        baseUrl: 'https://api.notes.example',
        issuer: 'https://auth.example',
        resource: 'https://api.notes.example',
        clientId: 'notes-mcp',
        clientSecret: process.env.NOTES_MCP_SECRET!,
        scopes: ['notes:read', 'notes:write'],
    },
    onError: error => console.error(error),
});

serve({ fetch: app.fetch, port: 3000 });
```

An agent (Claude Code, say) is pointed at `https://notes.example/mcp`, and discovers the rest itself.

## Tools

| Tool | Does | Scope | Annotations |
|---|---|---|---|
| `find_notes` | Lists notes, newest first, as `{ id, title, createdAt }`. Optional `q` (title contains), `limit` (default 10) | `notes:read` | read-only |
| `read_note` | One note, with its body | `notes:read` | read-only |
| `add_note` | Adds a note, answering `{ id, createdAt }` | `notes:write` | not read-only, not destructive, not idempotent |

Every result has `structuredContent` matching the tool's `outputSchema`, and the same as JSON text for clients that only read text. `tools/list` is in a fixed order, as the spec asks, so a client's prompt cache keeps hitting.

## Mapping onto the API

The tools are shaped around what an agent does, not mirrored from the endpoints:

- **Listing never returns bodies.** A list is for choosing; `read_note` fetches the one chosen. The API's `listNotes` returns whole notes, and the tool drops the bodies.
- **Adding answers with what the agent doesn't know**: the id and time, not the title and body it just sent.
- **Inputs carry the API's constraints, read from its `openapi.json`**: `NewNote` is `add_note`'s input schema as is, and `q`, `limit` and `id` are the API's parameter schemas. A tool can't accept what the API would reject, and changing the API's limits changes the tools'. Only `limit`'s default differs (10, not 20), since each note listed costs context.
- **Outputs carry only the shape** (types and formats): an agent reads them, never sends them, so the API's limits would be context spent for nothing.
- **Failures the agent can fix say how**: a missing note is an `isError` result saying `find_notes` lists the ids. Arguments that break the schema are rejected by the SDK before the tool runs. **Failures it can't fix say only that the service failed**: an API refusing the server's token, down, or not answering within 10 seconds, is reported to `onError` and never shown to the agent (no internal URLs, statuses, or stack traces).
- **Titles and bodies are untrusted.** Notes are user-written text, and an agent reading one could take instructions from it. `read_note`'s description says they are data, never instructions; nothing here can make that a guarantee. A real deployment that mixes users' content would keep it apart from instructions in the client too, or not return it at all.

## Keeping agents' context small

Every connected agent pays for `tools/list` in its context, on every conversation. A test holds the whole list (names, descriptions and schemas, as JSON) to a budget, about 550 tokens, so it grows only on purpose. What keeps it there: three tools rather than one per endpoint, descriptions of one or two sentences that say when to use another tool, and output schemas without limits.

## Authorization

The server is an OAuth 2.1 resource server, as the MCP spec (2026-07-28) requires for HTTP:

1. A request without a token is a `401` with `WWW-Authenticate: Bearer resource_metadata="…", scope="notes:read"`.
2. The client reads the Protected Resource Metadata (RFC 9728) at `/.well-known/oauth-protected-resource/mcp`: the resource, its authorization server, and `scopes_supported: ["notes:read"]`, the least that's useful.
3. It authorizes there (PKCE, `resource` = this server), and sends the token with every request.
4. The token is verified as a JWT (RFC 9068): signed with one of the issuer's keys (by discovery), issued by it, for this server (`aud`), not expired, with `notes:read`.
5. `add_note` needs `notes:write` too. Without it, the call is a `403` with `error="insufficient_scope", scope="notes:read notes:write"` (every scope the call needs, not only the missing one, as a client may ask for exactly what it's told), and the client steps up: it asks the user again, and retries.

A token for another service, even from the same issuer (the server's own token for the API, say), is refused. A refused token is the caller's mistake, so it isn't reported. A verifier that can't check a token for another reason (its issuer's keys unreachable) is a `500`, reported to `onError`: the token may well be fine, and the operators need to know.

## The server's own credentials

The server calls the notes API as itself, never as the agent: it gets its own token with the client credentials grant, for the API's audience, and caches it until 30 seconds before it expires (or half its life, if that's shorter). The agent's token is never passed on: the spec forbids it, and it would be refused anyway, since it was issued for the MCP server.

The API therefore sees one client, not the user. That's right for an API whose data is shared, like this one. An API with per-user data would need to know the user: the server would exchange the agent's token for one for the API (token exchange, RFC 8693), still never passing it on.

## Transport

- **Streamable HTTP, stateless**, as the 2026-07-28 spec is: no sessions, no initialize handshake, and every request answered by a fresh `McpServer` from `createMcpHandler`. Any instance can answer any request.
- **2025-era clients** (with the initialize handshake) are served too, statelessly, from the same tools: the SDK's default, tested with its client's `legacy` version negotiation.
- **DNS rebinding**: a `Host` or `Origin` not in `allowedHosts` is a `403`, before anything else.
- **Authentication before the body**: a request is authenticated before its body is read, so a caller without a token costs nothing to refuse. A body over 128 KiB (more than any tool's input) is then a `413`, before it's parsed.
- **Timeouts**: every request the server makes (discovery, keys, tokens, the API) gives up after 10 seconds.

## Composing with haywire

| Identifier | Bound by | Default in `createNotesMcpApp` |
|---|---|---|
| `notesClientId` | the app | `notesApiBinding(api)`: the API client, with client credentials |
| `tokenVerifierId` | the app | `jwtVerifierBinding({ issuer, audience: resourceUrl })` |
| `mcpConfigId` | the app | `resourceUrl`, `issuer`, `allowedHosts`, `onError` |
| `mcpAppId` | `mcpModule` | the Hono app |

Another authorization server (Keycloak, a hosted provider) is a different `issuer`; another way to verify tokens (introspection) is another `OAuthTokenVerifier` for `tokenVerifierId`.

## Testing

Everything is real, as deployed: a [dev OAuth server](../../oauth-server), the [notes API](../../openapi/server) on a database of its own (from [`pg-dolly`](../../../tools/pg-dolly)) accepting only that server's tokens, and the MCP server in front, each on a free port. The agent is the SDK's own `Client`, with an OAuth provider that plays the user with `followAuthorization`, so each test runs the whole flow: the `401`, discovery, PKCE, the token, and the step-up for `add_note`. Failures are made, not mocked: the API stopped, the API accepting another audience, an issuer with no discovery document, keys that can't be fetched. Token expiry is tested by moving the clock (Sinon's fake `Date`), never by waiting.

## What was learned

- **`requireBearerAuth` turns any verifier error that isn't an `OAuthError` into a `500` without reporting it.** An issuer that's down would be invisible to the operators, so the verifier is wrapped to report those.
- **The SDK's Hono helper (`createMcpHonoApp`) reads the body before any route runs**, so authentication can't come first. A plain Hono app, with the SDK's own `Host` and `Origin` checks (`hostHeaderValidationResponse`, `originValidationResponse`), keeps the order right.
- **jose rejects a bad token and an unreachable issuer alike.** Only its token errors (expired, a bad signature, wrong claims, no matching key) mean the token is wrong; anything else is the server's problem, not the caller's.
- **The SDK's client warns unless its OAuth provider keeps discovery state** (`saveDiscoveryState`), which it uses to check the authorization came back from the server it went to.
- **The SDK accepts JSON Schema through `fromJsonSchema`**, validated with Ajv: the API's schemas are used as they are, with no Zod.
- **Most of `tools/list` is input schemas and structure**, not descriptions: dropping the API's limits from the outputs saved only about 7%. Fewer tools, and fewer properties, are what keep it small.

## Not covered

- Per-user data, and token exchange (RFC 8693) to call the API as the user.
- Client registration other than pre-registered clients: Client ID Metadata Documents (the spec's preferred way) need an `https` client id, and Dynamic Client Registration is deprecated.
- Resources, prompts, subscriptions (`subscriptions/listen`), elicitation and tasks.
- Dropping the cached service token when the API refuses it (its keys rotated, say): it's used until it nears expiry.
- Rate limiting, and auditing what each agent did.

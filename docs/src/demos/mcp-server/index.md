---
description: An MCP server that makes a REST API easy for AI agents to use, with tools shaped around tasks, OAuth with step-up scopes, and token exchange so it calls the API as the agent's user.
---

# MCP server

<ProjectHeader />

An MCP server that gives AI agents a few task-shaped tools over the notes API, and calls the API as the agent's user through OAuth token exchange.

An AI agent is good at wiring things together, but every call it makes costs context, and is another chance to get something wrong. So the easy path for an agent should be one short, typed, authorized call per task, with the plumbing (discovery, tokens, mapping onto the API, and errors) handled for it on the other side.

This demo does that for agents that connect to services, in front of the [notes API](/demos/openapi/). A companion demo, the [CLI](/demos/agent-cli/), does the same for agents with a shell.

```
agent ──MCP──► MCP server ──(exchanged token)──► notes API ──► Postgres
   (the agent logs in at the dev OAuth server; each server verifies its own tokens)
```

## Why each piece

The notes API itself doesn't change for agents. It's a REST API described by OpenAPI, and it knows nothing about them. MCP is a different protocol (JSON-RPC on one endpoint, which describes itself through `tools/list`), so the MCP server sits beside the API rather than inside it, and calls it like any other client would.

The tools are shaped around tasks rather than copied from the endpoints. They return summaries by default and details on request. Their inputs use the API's own constraints, read from `openapi.json`, so a tool can't accept anything the API would reject.

Every hop has its own token, all for the same user. The agent gets a token for the MCP server, and the MCP server exchanges it (RFC 8693) for a token for the API, for the same user and with no more scopes (`act` says the server is acting for the user). No token is passed along as is, and each server checks that a token was issued for it (`aud`). The API shows each user only their own notes, whether they came through MCP or the CLI.

The authorization server is a standard one. The [dev OAuth server](https://github.com/JacobLey/leyman/tree/main/tools/oauth-dev-server) runs the real flow locally, and a Keycloak sidecar or a hosted provider could replace it by changing URLs.

This is a worked example rather than a package, and it isn't published. It's still a full package (lint, types, 100% coverage), tested against the real notes API, Postgres and the dev OAuth server.

## Example

```ts
declare const process: { env: Record<string, string> };
// ---cut---
import { serve } from '@hono/node-server';
import { createNotesMcpApp } from '@leyman/demo-agents-mcp';

const app = createNotesMcpApp({
    // Where it is served: agents' tokens must be issued for exactly this
    resourceUrl: 'https://notes.example/mcp',
    // Who agents get tokens from
    issuer: 'https://auth.example',
    // Host and Origin it answers to, against DNS rebinding
    allowedHosts: ['notes.example'],
    // The notes API, and the server's credentials to exchange agents' tokens
    api: {
        baseUrl: 'https://api.notes.example',
        issuer: 'https://auth.example',
        resource: 'https://api.notes.example',
        clientId: 'notes-mcp',
        clientSecret: process.env.NOTES_MCP_SECRET,
    },
    onError: error => console.error(error),
});

serve({ fetch: app.fetch, port: 3000 });
```

An agent (Claude Code, say) is pointed at `https://notes.example/mcp`, and discovers the rest itself.

## Tools

| Tool         | Does                                                                                                          | Scope         | Annotations                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------- |
| `find_notes` | Lists notes, newest first, as `{ id, title, createdAt }`. Optional `q` (title contains), `limit` (default 10) | `notes:read`  | read-only                                      |
| `read_note`  | One note, with its body                                                                                       | `notes:read`  | read-only                                      |
| `add_note`   | Adds a note, answering `{ id, createdAt }`                                                                    | `notes:write` | not read-only, not destructive, not idempotent |

Every result has `structuredContent` matching the tool's `outputSchema`, and the same as JSON text for clients that only read text. `tools/list` is in a fixed order, as the spec asks, so a client's prompt cache keeps hitting.

## Mapping onto the API

The tools follow what an agent wants to do, rather than mapping one to one onto the endpoints.

- Listing doesn't return bodies. A list is for choosing a note, and `read_note` then fetches the one chosen. The API's `listNotes` returns whole notes, so the tool drops the bodies.
- Adding a note answers with what the agent doesn't already know, which is the id and time rather than the title and body it just sent.
- Inputs use the API's constraints, read from its `openapi.json`. `NewNote` is `add_note`'s input schema as it is, and `q`, `limit` and `id` use the API's parameter schemas. So a tool can't accept anything the API would reject, and changing the API's limits changes the tools' limits too. Only the default for `limit` differs (10 rather than 20), since each note listed costs context.
- Outputs only describe the shape (types and formats). An agent reads outputs and doesn't send them, so the API's limits there would cost context for nothing.
- A failure the agent can fix tells it how. A missing note is an `isError` result saying that `find_notes` lists the ids, and the SDK rejects arguments that break the schema before the tool runs. A failure the agent can't fix only says the service failed. If the API refuses the server's token, is down, or doesn't answer within 10 seconds, that is reported to `onError`, and the agent doesn't see internal URLs, statuses or stack traces.
- Adding a note is retried without ever adding it twice. `add_note` sends the API an `Idempotency-Key`, new for each call of the tool. When the answer may have been lost (a timeout, a dropped connection, a gateway's `5xx`) or the API answers `409` (an earlier attempt is still running), it sends the request again with the same key, up to three times in all. The API adds the note once and answers each retry with it, so a slow API can't leave the agent with two notes, or with one it doesn't know about. The tool still has `idempotentHint: false`, because calling it again adds another note, with another key.
- Titles and bodies are untrusted. Notes are text written by users, and an agent reading one could take instructions from it. `read_note`'s description tells the agent they are data and not instructions, but nothing here can guarantee the agent listens. A real deployment that mixes users' content would also keep it apart from instructions in the client, or not return it at all.

## Keeping agents' context small

Every connected agent pays for `tools/list` in its context, in every conversation. A test holds the whole list (names, descriptions and schemas, as JSON) to a budget of about 550 tokens, so it can't grow by accident. It stays that small because there are three tools rather than one per endpoint, each description is one or two sentences that say when to use another tool, and the output schemas leave out limits.

## Authorization

The server is an OAuth 2.1 resource server, as the MCP spec (2026-07-28) requires for HTTP:

1. A request without a token is a `401` with `WWW-Authenticate: Bearer resource_metadata="…", scope="notes:read"`.
2. The client reads the Protected Resource Metadata (RFC 9728) at `/.well-known/oauth-protected-resource/mcp`: the resource, its authorization server, and `scopes_supported: ["notes:read"]`, the least that's useful.
3. It authorizes there (PKCE, `resource` = this server), and sends the token with every request.
4. The token is verified as a JWT (RFC 9068): signed with one of the issuer's keys (by discovery), issued by it, for this server (`aud`), not expired, with `notes:read`.
5. `add_note` needs `notes:write` too. Without it, the call is a `403` with `error="insufficient_scope", scope="notes:read notes:write"` (every scope the call needs, not only the missing one, as a client may ask for exactly what it's told), and the client steps up: it asks the user again, and retries.

A token for another service is refused, even from the same issuer (such as the token the server got for the API by exchange). So is a service's own token (client credentials), whose subject is its `client_id` rather than a user. A refused token is the caller's mistake, so it isn't reported. When the verifier can't check a token for some other reason (the issuer's keys are unreachable), the request gets a `500` and the error goes to `onError`, because the token may well be fine and the operators need to know.

## Calling the API as the user

The server calls the notes API as the agent's user, since each user's notes are theirs alone. It can't use the agent's token for that, because the spec forbids passing it on, and the API would refuse it anyway, as it was issued for the MCP server. Instead, the server exchanges it at the authorization server for a token for the API (token exchange, RFC 8693):

1. The server authenticates as itself (its client id and secret), and sends the agent's token as `subject_token`, with `resource` set to the API.
2. The authorization server checks that the agent's token was issued for this server (a token issued for anything else isn't the server's to exchange). It answers with a token for the API, for the same user (`sub`), with at most the same scopes, and with `act: { sub: "notes-mcp" }` saying who is acting for the user. The new token doesn't outlive the agent's.
3. The API sees the user, as it would from the CLI, and could tell from `act` that the request came through the MCP server.

The exchanged token for each agent token is kept until 30 seconds before it expires (or half its life, if that's shorter), so an agent's calls share one. Expired ones are dropped as other calls come in. Each request's `McpServer` gets an API client for that request's agent token, from the `authInfo` that the SDK's handler passes to its factory.

## Transport

- The server uses Streamable HTTP and is stateless, as the 2026-07-28 spec is. There are no sessions and no initialize handshake, and each request is answered by a fresh `McpServer` from `createMcpHandler`, so any instance can answer any request.
- 2025-era clients (which use the initialize handshake) are served too, statelessly and from the same tools. That's the SDK's default, and it's tested with the SDK client's `legacy` version negotiation.
- To guard against DNS rebinding, a `Host` or `Origin` that isn't in `allowedHosts` gets a `403` before anything else happens.
- A request is authenticated before its body is read, so refusing a caller without a token costs nothing. After that, a body over 128 KiB (more than any tool's input) gets a `413` before it's parsed.
- Every request the server makes (discovery, keys, tokens, the API) gives up after 10 seconds.

## Composing with haywire

| Identifier        | Bound by    | Default in `createNotesMcpApp`                                                          |
| ----------------- | ----------- | --------------------------------------------------------------------------------------- |
| `notesApiId`      | the app     | `notesApiBinding(api)`: an API client for an agent's token, exchanging it for the API's |
| `tokenVerifierId` | the app     | `jwtVerifierBinding({ issuer, audience: resourceUrl })`                                 |
| `mcpConfigId`     | the app     | `resourceUrl`, `issuer`, `allowedHosts`, `onError`                                      |
| `mcpAppId`        | `mcpModule` | the Hono app                                                                            |

Another authorization server (Keycloak, a hosted provider) is a different `issuer`; another way to verify tokens (introspection) is another `OAuthTokenVerifier` for `tokenVerifierId`.

## Testing

The tests run everything for real, as it would be deployed. A [dev OAuth server](https://github.com/JacobLey/leyman/tree/main/tools/oauth-dev-server), the [notes API](/demos/openapi/#the-server) on a database of its own (from [`pg-dolly`](/packages/pg-dolly/)) that accepts only that server's tokens, and the MCP server in front each run on a free port. The agent is the SDK's own `Client`, with the dev server's OAuth provider (`DevOAuthClientProvider`, from `oauth-dev-server/mcp`) playing the user, so each test goes through the whole flow: the `401`, discovery, PKCE, the token, the step-up for `add_note`, and the exchange. Two agents signed in as different users (`login_hint` at the dev server's login) each find only their own notes.

Failures are caused for real rather than mocked. The tests stop the API, lose the API's answer to an added note on the way (replacing it with a `502` after the API ran it, so the retry gets the same note back), answer `409` while the first attempt still runs, have the API accept another audience, and use an issuer with no discovery document or keys that can't be fetched. Token expiry is tested by moving the clock (Sinon's fake `Date`) rather than by waiting.

## What was learned

- `requireBearerAuth` turns any verifier error that isn't an `OAuthError` into a `500` without reporting it. An issuer that's down would then be invisible to the operators, so the verifier is wrapped to report those errors.
- The SDK's Hono helper (`createMcpHonoApp`) reads the body before any route runs, so authentication can't come first. A plain Hono app, with the SDK's own `Host` and `Origin` checks (`hostHeaderValidationResponse`, `originValidationResponse`), keeps the order right.
- jose rejects a bad token and an unreachable issuer the same way. Only its token errors (expired, a bad signature, wrong claims, no matching key) mean the token is wrong, and anything else is the server's problem rather than the caller's.
- The SDK's client warns unless its OAuth provider keeps discovery state (`saveDiscoveryState`), which the client uses to check that the authorization came back from the server it went to.
- The SDK's handler passes each request's `authInfo` to its factory, so a fresh `McpServer` per request can hold an API client for that request's user, instead of one client shared by everyone.
- The SDK accepts JSON Schema through `fromJsonSchema`, validated with Ajv, so the API's schemas are used as they are, without Zod.
- Most of `tools/list` is input schemas and structure rather than descriptions. Dropping the API's limits from the outputs only saved about 7%, and what keeps the list small is having fewer tools with fewer properties.

## Not covered

- Revoking exchanged tokens when the agent's token is revoked. They're JWTs, valid until they expire (which is no later than the agent's token).
- Registering clients other than pre-registered ones. Client ID Metadata Documents (the spec's preferred way) need an `https` client id, and Dynamic Client Registration is deprecated.
- Resources, prompts, subscriptions (`subscriptions/listen`), elicitation and tasks.
- Dropping the cached service token when the API refuses it (after a key rotation, say). It's used until it nears expiry.
- Rate limiting, and auditing what each agent did.

---
description: Making a REST API easy for AI agents to use - an MCP server with tools shaped for tasks, step-up scopes and token exchange to call the API as the user, and a CLI that logs in once then runs one short command per task, both authorized end to end with OAuth.
---

# Agents

**Source:** [`demos/agents`](https://github.com/JacobLey/leyman/tree/main/demos/agents)

How to make a REST API easy for AI agents to use, from both sides: an MCP server for agents that connect to services, and a CLI for agents with a shell, both on top of the [notes API](/demos/openapi), authorized end to end with OAuth.

The thesis: an agent is good at wiring things together, but every call it makes costs context and a chance to go wrong. So the happy path should be one short, typed, authorized call per task, with the plumbing (discovery, tokens, refresh, mapping onto the API, errors) done for it on the other side.

```
agent ──MCP──► mcp ──(exchanged)──────┐
                                      ├──► notes API ──► Postgres
agent ──shell──► notes CLI ──(user's)─┘
       (both log in at the dev OAuth server; each server verifies its own tokens)
```

## Why each piece

- **MCP and a CLI are the two sides of the same idea.** MCP serves agents that connect to services; a CLI serves agents with a shell, where `notes list --q sheep` is a few tokens for a fully authorized request. Both keep the plumbing on their side.
- **The API stays an API.** The notes API is a REST API described by OpenAPI, unaware of agents. MCP is a different protocol (JSON-RPC on one endpoint, describing itself through `tools/list`), so it sits beside the API rather than inside it, and calls it like any other client would.
- **Tools are shaped for tasks, not mirrored from endpoints**: summaries by default, details on request, and the API's own constraints, read from `openapi.json`, so a tool can't accept what the API would reject.
- **Every hop has its own token, and the user goes all the way.** The agent gets a token for the MCP server; the MCP server exchanges it (RFC 8693) for one for the API, as the same user, with no more scopes. No token is passed on, each server checks a token was issued for it (`aud`), and the API shows each user only their notes, whether they came through MCP or the CLI.
- **One authorization server, three kinds of token**: the agent's for the MCP server and the CLI's for the API (authorization code with PKCE, refresh tokens), and the MCP server's for the API, exchanged for the agent's (token exchange, with `act` naming the server). The API names its authorization server (RFC 9728), so the CLI needs only its URL. The dev OAuth server runs the real flow locally; a Keycloak sidecar or a hosted provider could replace it by changing URLs.

Worked examples, not packages: none is published. Each is a full package (lint, types, 100% coverage), tested against the real notes API, Postgres, and the [dev OAuth server](/demos/oauth-server).

## The MCP server

**Source:** [`demos/agents/mcp`](https://github.com/JacobLey/leyman/tree/main/demos/agents/mcp)

An MCP server over the notes API: tools shaped for agents, an OAuth resource server, calling the API as the agent's user by token exchange.

### Example

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

### Tools

| Tool | Does | Scope | Annotations |
|---|---|---|---|
| `find_notes` | Lists notes, newest first, as `{ id, title, createdAt }`. Optional `q` (title contains), `limit` (default 10) | `notes:read` | read-only |
| `read_note` | One note, with its body | `notes:read` | read-only |
| `add_note` | Adds a note, answering `{ id, createdAt }` | `notes:write` | not read-only, not destructive, not idempotent |

Every result has `structuredContent` matching the tool's `outputSchema`, and the same as JSON text for clients that only read text. `tools/list` is in a fixed order, as the spec asks, so a client's prompt cache keeps hitting.

### Mapping onto the API

The tools are shaped around what an agent does, not mirrored from the endpoints:

- **Listing never returns bodies.** A list is for choosing; `read_note` fetches the one chosen. The API's `listNotes` returns whole notes, and the tool drops the bodies.
- **Adding answers with what the agent doesn't know**: the id and time, not the title and body it just sent.
- **Inputs carry the API's constraints, read from its `openapi.json`**: `NewNote` is `add_note`'s input schema as is, and `q`, `limit` and `id` are the API's parameter schemas. A tool can't accept what the API would reject, and changing the API's limits changes the tools'. Only `limit`'s default differs (10, not 20), since each note listed costs context.
- **Outputs carry only the shape** (types and formats): an agent reads them, never sends them, so the API's limits would be context spent for nothing.
- **Failures the agent can fix say how**: a missing note is an `isError` result saying `find_notes` lists the ids. Arguments that break the schema are rejected by the SDK before the tool runs. **Failures it can't fix say only that the service failed**: an API refusing the server's token, down, or not answering within 10 seconds, is reported to `onError` and never shown to the agent (no internal URLs, statuses, or stack traces).
- **Titles and bodies are untrusted.** Notes are user-written text, and an agent reading one could take instructions from it. `read_note`'s description says they are data, never instructions; nothing here can make that a guarantee. A real deployment that mixes users' content would keep it apart from instructions in the client too, or not return it at all.

### Keeping agents' context small

Every connected agent pays for `tools/list` in its context, on every conversation. A test holds the whole list (names, descriptions and schemas, as JSON) to a budget, about 550 tokens, so it grows only on purpose. What keeps it there: three tools rather than one per endpoint, descriptions of one or two sentences that say when to use another tool, and output schemas without limits.

### Authorization

The server is an OAuth 2.1 resource server, as the MCP spec (2026-07-28) requires for HTTP:

1. A request without a token is a `401` with `WWW-Authenticate: Bearer resource_metadata="…", scope="notes:read"`.
2. The client reads the Protected Resource Metadata (RFC 9728) at `/.well-known/oauth-protected-resource/mcp`: the resource, its authorization server, and `scopes_supported: ["notes:read"]`, the least that's useful.
3. It authorizes there (PKCE, `resource` = this server), and sends the token with every request.
4. The token is verified as a JWT (RFC 9068): signed with one of the issuer's keys (by discovery), issued by it, for this server (`aud`), not expired, with `notes:read`.
5. `add_note` needs `notes:write` too. Without it, the call is a `403` with `error="insufficient_scope", scope="notes:read notes:write"` (every scope the call needs, not only the missing one, as a client may ask for exactly what it's told), and the client steps up: it asks the user again, and retries.

A token for another service, even from the same issuer (the token the server exchanged for the API's, say), is refused. A refused token is the caller's mistake, so it isn't reported. A verifier that can't check a token for another reason (its issuer's keys unreachable) is a `500`, reported to `onError`: the token may well be fine, and the operators need to know.

### Calling the API as the user

The server calls the notes API as the agent's user, whose notes are theirs alone, but never with the agent's token: the spec forbids passing it on, and the API would refuse it anyway, since it was issued for the MCP server. Instead, the server exchanges it (token exchange, RFC 8693) at the authorization server for one for the API:

1. The server authenticates as itself (its client id and secret), and sends the agent's token as `subject_token`, with `resource` set to the API.
2. The authorization server checks the agent's token was issued for this server (a token issued for anything else isn't the server's to exchange), and answers with a token for the API: the same user (`sub`), at most the same scopes, and `act: { sub: "notes-mcp" }` saying who acts for them. It never outlives the agent's token.
3. The API sees the user, as it would from the CLI, and could tell from `act` that the MCP server sent it.

Each agent token's exchange is kept until 30 seconds before it expires (or half its life, if that's shorter), so an agent's calls share one; expired ones are dropped as others come in. Each request's `McpServer` gets an API client for its own agent's token, from the `authInfo` the SDK's handler passes its factory.

### Transport

- **Streamable HTTP, stateless**, as the 2026-07-28 spec is: no sessions, no initialize handshake, and every request answered by a fresh `McpServer` from `createMcpHandler`. Any instance can answer any request.
- **2025-era clients** (with the initialize handshake) are served too, statelessly, from the same tools: the SDK's default, tested with its client's `legacy` version negotiation.
- **DNS rebinding**: a `Host` or `Origin` not in `allowedHosts` is a `403`, before anything else.
- **Authentication before the body**: a request is authenticated before its body is read, so a caller without a token costs nothing to refuse. A body over 128 KiB (more than any tool's input) is then a `413`, before it's parsed.
- **Timeouts**: every request the server makes (discovery, keys, tokens, the API) gives up after 10 seconds.

### Composing with haywire

| Identifier | Bound by | Default in `createNotesMcpApp` |
|---|---|---|
| `notesApiId` | the app | `notesApiBinding(api)`: an API client for an agent's token, exchanging it for the API's |
| `tokenVerifierId` | the app | `jwtVerifierBinding({ issuer, audience: resourceUrl })` |
| `mcpConfigId` | the app | `resourceUrl`, `issuer`, `allowedHosts`, `onError` |
| `mcpAppId` | `mcpModule` | the Hono app |

Another authorization server (Keycloak, a hosted provider) is a different `issuer`; another way to verify tokens (introspection) is another `OAuthTokenVerifier` for `tokenVerifierId`.

### Testing

Everything is real, as deployed: a [dev OAuth server](/demos/oauth-server), the [notes API](/demos/openapi#the-server) on a database of its own (from [`pg-dolly`](/pg-dolly/)) accepting only that server's tokens, and the MCP server in front, each on a free port. The agent is the SDK's own `Client`, with an OAuth provider that plays the user with `followAuthorization`, so each test runs the whole flow: the `401`, discovery, PKCE, the token, the step-up for `add_note`, and the exchange. Two agents, signed in as different users (`login_hint` at the dev server's login), each find only their own notes. Failures are made, not mocked: the API stopped, the API accepting another audience, an issuer with no discovery document, keys that can't be fetched. Token expiry is tested by moving the clock (Sinon's fake `Date`), never by waiting.

### What was learned

- **`requireBearerAuth` turns any verifier error that isn't an `OAuthError` into a `500` without reporting it.** An issuer that's down would be invisible to the operators, so the verifier is wrapped to report those.
- **The SDK's Hono helper (`createMcpHonoApp`) reads the body before any route runs**, so authentication can't come first. A plain Hono app, with the SDK's own `Host` and `Origin` checks (`hostHeaderValidationResponse`, `originValidationResponse`), keeps the order right.
- **jose rejects a bad token and an unreachable issuer alike.** Only its token errors (expired, a bad signature, wrong claims, no matching key) mean the token is wrong; anything else is the server's problem, not the caller's.
- **The SDK's client warns unless its OAuth provider keeps discovery state** (`saveDiscoveryState`), which it uses to check the authorization came back from the server it went to.
- **The SDK's handler passes its factory each request's `authInfo`**, so a fresh `McpServer` per request can hold an API client for that request's user, rather than one shared by all.
- **The SDK accepts JSON Schema through `fromJsonSchema`**, validated with Ajv: the API's schemas are used as they are, with no Zod.
- **Most of `tools/list` is input schemas and structure**, not descriptions: dropping the API's limits from the outputs saved only about 7%. Fewer tools, and fewer properties, are what keep it small.

### Not covered

- Revoking exchanged tokens when the agent's is revoked: they're JWTs, valid until they expire (at most as long as the agent's).
- Client registration other than pre-registered clients: Client ID Metadata Documents (the spec's preferred way) need an `https` client id, and Dynamic Client Registration is deprecated.
- Resources, prompts, subscriptions (`subscriptions/listen`), elicitation and tasks.
- Dropping the cached service token when the API refuses it (its keys rotated, say): it's used until it nears expiry.
- Rate limiting, and auditing what each agent did.

## The CLI

**Source:** [`demos/agents/cli`](https://github.com/JacobLey/leyman/tree/main/demos/agents/cli)

A CLI for the notes API, made for agents and people: one short command per task, with login, tokens and errors handled inside.

### Example

```sh
$ notes login --api https://api.notes.example
Log in at: https://auth.example/auth?response_type=code&client_id=notes-cli&…
Logged in to https://api.notes.example

$ notes list --q sheep
01a16742-a051-7e2c-a843-253ce924480d  2026-10-23T05:36:22.097Z  Dolly the sheep

$ notes get 01a16742-a051-7e2c-a843-253ce924480d
Dolly the sheep

The first mammal cloned from an adult cell.

$ notes add --title "Shopping" --body "Eggs"
01a16743-0c4e-7d1a-9b55-4e1c0a6f2b10

$ git log -1 --format=%B | notes add --title "Last commit" --stdin --json
{"id":"01a16743-5d2f-7a0e-8c31-9f2d6b7e4a21"}
```

### Commands

| Command | Does |
|---|---|
| `notes login [--api <url>] [--client-id notes-cli] [--timeout 600]` | Logs in (opens a browser, and waits up to `--timeout` seconds), and keeps the login |
| `notes logout` | Revokes the login, and forgets it |
| `notes list [--q <text>] [--limit 10]` | One line per note, newest first: id, time, title. Never bodies |
| `notes get <id>` | The note's title, a blank line, its body |
| `notes add --title <title> [--body <text> \| --stdin]` | Adds a note, and prints its id. `--body` and `--stdin` can't both be given |

Every command takes `--json`, to print JSON for a program to read, and `--config-dir`, where the login is kept (`$NOTES_CONFIG_DIR`, else `$XDG_CONFIG_HOME/notes-demo`, else `~/.config/notes-demo`). `--api` defaults to `$NOTES_API_URL`.

### Made for agents

An agent with a shell can use any CLI, and a good one costs it very little: `notes list --q sheep` is a few tokens in and a line per note out, fully authorized, with the CLI doing the work an agent would otherwise spend context on.

- **Output is short by default**, and the same shape every time: a list is ids, times and titles, one per line; `get` is the title, then the body. `--json` when a program (or an agent that wants to parse it) reads it.
- **Users' text is printed escaped.** A title or body could hold a terminal escape sequence (to recolour or rewrite what's shown) or a carriage return (to hide what came before): control characters are printed as JSON would (`\u001b`), but for a body's newlines and tabs. A title's newline is escaped too, so a list stays one line per note.
- **Nothing is asked interactively**, except the browser login: every input is a flag, with a default where one makes sense.
- **stdin is read only with `--stdin`.** An agent's shell may leave stdin open, and a CLI that reads it unasked waits forever.
- **The login is set up once, by a person**, and every command after just works: the CLI refreshes the token when it expires, and saves the new one. An agent never handles a token.
- **A failure is one line on stderr, saying what to do**, and its exit code says what kind it is: `3` when only logging in again can fix it, so an agent can ask its user to without parsing the message (see [Errors](#errors)).

### Login

`notes login` needs only the API's URL. Everything else is discovered:

1. The API's Protected Resource Metadata (RFC 9728) names its authorization server, its scopes, and its canonical identifier.
2. The authorization server's metadata gives its endpoints: at RFC 8414's well-known URL, else at OpenID Connect's (which Keycloak serves instead), in the order the MCP spec gives.
3. The CLI listens on a free port of `127.0.0.1` (a loopback redirect, RFC 8252), and sends the user to authorize: the URL is printed, and opened with `$BROWSER` when it's set. PKCE (S256), a random `state`, and `resource` set to the API (RFC 8707), asking for every scope the API names (or none, for the server's default, if it names none). It waits 10 minutes (`--timeout`) for the browser to come back.
4. The browser comes back to the loopback with a code. The CLI checks the `state`, and that the response came from the server it went to (`iss`, RFC 9207), then trades the code for tokens.
5. The access and refresh tokens are kept in `session.json`, readable only by its owner (`0600`, in a `0700` directory): a refresh token is as good as a password until it's revoked. It's written to a new file and renamed into place, so it's never half written, and never left readable by others, whatever the old file's mode was.

Before each request, an expired access token (30 seconds early, or half its life if that's shorter) is refreshed, and the new tokens saved. A token the API refuses (`401`) before it expires, or one the server gave no expiry for, is refreshed once, and the request tried again. Refreshing goes to the issuer the login was made at, never one the API names since.

One command refreshes at a time, holding `session.lock`; a command that waited reads the session again, and uses the token refreshed meanwhile. Commands run at once (an agent's, in parallel) would otherwise each spend the same refresh token, and an authorization server that rotates them takes a second use as a stolen token, and revokes the login. A lock older than 30 seconds was left by a command that died, and is taken over.

`notes logout` revokes the refresh token (RFC 7009) at the issuer the login was made at, which revokes the login there: a copy of `session.json` can't be refreshed after. The access token can't be revoked (it's a JWT the API checks by itself), so it stays good until it expires, minutes later. The login is forgotten here even when revoking fails, and the failure said; a server that can't revoke tokens (it names no revocation endpoint) is said on stderr.

Every request (discovery, tokens, the API) gives up after 10 seconds. The CLI is a public client (it can't keep a secret), so it has no client secret, and relies on PKCE. The OAuth is [oauth4webapi](https://github.com/panva/oauth4webapi), which checks each of these steps; plain HTTP is allowed only to this machine (`127.0.0.1`, `localhost`), for local development.

### Errors

| When | stderr | Exit |
|---|---|---|
| Not logged in | `Not logged in. Run notes login --api <url> first.` | 3 |
| The login expired, and can't be refreshed (no refresh token, or the server refuses it) | `The login has expired, …. Run notes login again.` | 3 |
| The API refuses the token (`401` after a refresh, `403`) | `The API refused the login (…). Run notes login again.` | 3 |
| The login fails (denied, or a forged response) | `Login failed (…). Run notes login again.` | 3 |
| The browser doesn't come back in time | `Login timed out after 600s. Run notes login again.` | 3 |
| The API refuses the input (`400`) | `The API refused it: …`, with the API's reason | 1 |
| No such note | `No note has the id …. notes list shows the ids there are.` | 1 |
| The URL isn't an API that says how to log in | `… doesn't say how to log in (…). Is it the notes API?` | 1 |
| The authorization server can't be reached to refresh | `Failed to refresh the login at … (…).` | 1 |
| Logging out, the authorization server can't be reached or refuses | `Logged out here, but … did not revoke the login (…): it stays good there until it expires.` | 1 |
| Anything else (the API down, say) | `Failed: …` | 1 |
| A mistake in the command line | yargs's message, then `Run notes --help for usage.` | 2 |

### Testing

Each test runs `./bin.mjs` as a separate process, as anyone would, against a [dev OAuth server](/demos/oauth-server) and the [notes API](/demos/openapi#the-server) on a database of its own. `$BROWSER` is a small script playing the user: it signs in, asks for `/favicon.ico` as a browser would, and comes back to the CLI. It can come back with something else instead (a denial, a forged `state`), and a test can open the printed URL instead, as a user without `$BROWSER` would. Expiry is tested by editing the saved session, never by waiting, and logging out by putting the session file back after: it can't be refreshed. Commands run at once are tested too, by running four: without the lock, three of them find the login revoked. Two users, each logged in from a config directory of their own (`$BROWSER` signs in as `BROWSER_USER`), see only their own notes. One test logs in at a server that says the least the standards allow (OpenID discovery only, no scopes, no `iss`, tokens with no expiry or refresh token), which the CLI must still work with.

### What was learned

- **yargs' `.fail()` doesn't see errors from async handlers**: they reject `parseAsync` instead. The CLI catches them there, so every failure is one line.
- **yargs reads `-` as an argument of its own**, not as `--body`'s value, so "read stdin" is a flag (`--stdin`).
- **yargs takes a default as given**: `--stdin` defaulting to `false` conflicts with every `--body`, so it has no default.
- **oidc-provider revokes a login whose refresh token is used twice**, as RFC 9700 advises for rotated refresh tokens: two commands refreshing at once log the user out, hence the lock.
- **The resource is the API's own identifier, as its metadata says**, not the URL typed: `http://api` and `http://api/` are different audiences to an authorization server.
- **`oauth4webapi` refuses plain HTTP** unless allowed per request: allowing it only for this machine keeps production HTTPS-only.

### Not covered

- Keeping the refresh token in the OS keychain rather than a file.
- The device authorization grant (RFC 8628), for machines with no browser.
- OpenID Connect's metadata inserted after the host (`/.well-known/openid-configuration/<path>`), third in the MCP spec's order: only RFC 8414's and OpenID's usual URL are tried.
- A lock taken over by two commands at once: each could then refresh.

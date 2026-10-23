---
description: Making a REST API easy for AI agents to use - an MCP server with tools shaped for tasks and step-up scopes, and a CLI that logs in once then runs one short command per task, both authorized end to end with OAuth.
---

# Agents

**Source:** [`demos/agents`](https://github.com/JacobLey/leyman/tree/main/demos/agents)

How to make a REST API easy for AI agents to use, from both sides: an MCP server for agents that connect to services, and a CLI for agents with a shell, both on top of the [notes API](/demos/openapi), authorized end to end with OAuth.

The thesis: an agent is good at wiring things together, but every call it makes costs context and a chance to go wrong. So the happy path should be one short, typed, authorized call per task, with the plumbing (discovery, tokens, refresh, mapping onto the API, errors) done for it on the other side.

```
agent ──MCP──► mcp ──(its own token)──┐
                                      ├──► notes API ──► Postgres
agent ──shell──► notes CLI ──(user's)─┘
       (both log in at the dev OAuth server; each server verifies its own tokens)
```

## Why each piece

- **MCP and a CLI are the two sides of the same idea.** MCP serves agents that connect to services; a CLI serves agents with a shell, where `notes list --q sheep` is a few tokens for a fully authorized request. Both keep the plumbing on their side.
- **The API stays an API.** The notes API is a REST API described by OpenAPI, unaware of agents. MCP is a different protocol (JSON-RPC on one endpoint, describing itself through `tools/list`), so it sits beside the API rather than inside it, and calls it like any other client would.
- **Tools are shaped for tasks, not mirrored from endpoints**: summaries by default, details on request, and the API's own constraints, read from `openapi.json`, so a tool can't accept what the API would reject.
- **Every hop has its own token.** The agent gets a token for the MCP server; the MCP server gets its own for the API. No token is passed on, and each server checks a token was issued for it (`aud`).
- **One authorization server, three kinds of token**: the agent's for the MCP server and the user's for the API (authorization code with PKCE, refresh tokens), and the MCP server's own (client credentials). The API names its authorization server (RFC 9728), so the CLI needs only its URL. The dev OAuth server runs the real flow locally; a Keycloak sidecar or a hosted provider could replace it by changing URLs.

Worked examples, not packages: none is published. Each is a full package (lint, types, 100% coverage), tested against the real notes API, Postgres, and the [dev OAuth server](/demos/oauth-server).

## The MCP server

**Source:** [`demos/agents/mcp`](https://github.com/JacobLey/leyman/tree/main/demos/agents/mcp)

An MCP server over the notes API: tools shaped for agents, an OAuth resource server, and its own credentials for the API it calls.

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
    // The notes API, and the server's own credentials for it
    api: {
        baseUrl: 'https://api.notes.example',
        issuer: 'https://auth.example',
        resource: 'https://api.notes.example',
        clientId: 'notes-mcp',
        clientSecret: process.env.NOTES_MCP_SECRET,
        scopes: ['notes:read', 'notes:write'],
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
- **Failures the agent can fix say how**: a missing note is an `isError` result saying `find_notes` lists the ids. Arguments that break the schema are rejected by the SDK before the tool runs. **Failures it can't fix say only that the service failed**: an API refusing the server's token, or down, is reported to `onError` and never shown to the agent (no internal URLs, statuses, or stack traces).
- **The body is untrusted.** Notes are user-written text, and an agent reading one could take instructions from it. `read_note`'s description says to treat it as data; nothing here can make that a guarantee. A real deployment that mixes users' content would keep it apart from instructions in the client too, or not return it at all.

### Keeping agents' context small

Every connected agent pays for `tools/list` in its context, on every conversation. A test holds the whole list (names, descriptions and schemas, as JSON) to a budget, about 550 tokens, so it grows only on purpose. What keeps it there: three tools rather than one per endpoint, descriptions of one or two sentences that say when to use another tool, and output schemas without limits.

### Authorization

The server is an OAuth 2.1 resource server, as the MCP spec (2026-07-28) requires for HTTP:

1. A request without a token is a `401` with `WWW-Authenticate: Bearer resource_metadata="…", scope="notes:read"`.
2. The client reads the Protected Resource Metadata (RFC 9728) at `/.well-known/oauth-protected-resource/mcp`: the resource, its authorization server, and `scopes_supported: ["notes:read"]`, the least that's useful.
3. It authorizes there (PKCE, `resource` = this server), and sends the token with every request.
4. The token is verified as a JWT (RFC 9068): signed with one of the issuer's keys (by discovery), issued by it, for this server (`aud`), not expired, with `notes:read`.
5. `add_note` needs `notes:write` too. Without it, the call is a `403` with `error="insufficient_scope", scope="notes:write"`, and the client steps up: it asks the user again for both scopes, and retries.

A token for another service, even from the same issuer (the server's own token for the API, say), is refused. A verifier that fails for another reason than the token (its issuer down) is a `500`, reported to `onError`.

### The server's own credentials

The server calls the notes API as itself, never as the agent: it gets its own token with the client credentials grant, for the API's audience, and caches it until 30 seconds before it expires. The agent's token is never passed on: the spec forbids it, and it would be refused anyway, since it was issued for the MCP server.

The API therefore sees one client, not the user. That's right for an API whose data is shared, like this one. An API with per-user data would need to know the user: the server would exchange the agent's token for one for the API (token exchange, RFC 8693), still never passing it on.

### Transport

- **Streamable HTTP, stateless**, as the 2026-07-28 spec is: no sessions, no initialize handshake, and every request answered by a fresh `McpServer` from `createMcpHandler`. Any instance can answer any request.
- **2025-era clients** (with the initialize handshake) are served too, statelessly, from the same tools: the SDK's default, not tested here.
- **DNS rebinding**: a `Host` or `Origin` not in `allowedHosts` is a `403`, before authentication. JSON bodies over 4 MiB are a `413` before they're parsed (the SDK's default).

### Composing with haywire

| Identifier | Bound by | Default in `createNotesMcpApp` |
|---|---|---|
| `notesClientId` | the app | `notesApiBinding(api)`: the API client, with client credentials |
| `tokenVerifierId` | the app | `jwtVerifierBinding({ issuer, audience: resourceUrl })` |
| `mcpConfigId` | the app | `resourceUrl`, `issuer`, `allowedHosts`, `onError` |
| `mcpAppId` | `mcpModule` | the Hono app |

Another authorization server (Keycloak, a hosted provider) is a different `issuer`; another way to verify tokens (introspection) is another `OAuthTokenVerifier` for `tokenVerifierId`.

### Testing

Everything is real, as deployed: a [dev OAuth server](/demos/oauth-server), the [notes API](/demos/openapi#the-server) on a database of its own (from [`pg-dolly`](/pg-dolly/)) accepting only that server's tokens, and the MCP server in front, each on a free port. The agent is the SDK's own `Client`, with an OAuth provider that plays the user with `followAuthorization`, so each test runs the whole flow: the `401`, discovery, PKCE, the token, and the step-up for `add_note`. Failures are made, not mocked: the API stopped, the API accepting another audience, an issuer with no discovery document, keys that can't be fetched.

### What was learned

- **`requireBearerAuth` turns any verifier error that isn't an `OAuthError` into a `500` without reporting it.** An issuer that's down would be invisible to the operators, so the verifier is wrapped to report those.
- **`createMcpHonoApp` reads the JSON body itself** (to check its size), so the handler has to be given `parsedBody`, which its Hono app doesn't type.
- **The SDK's client warns unless its OAuth provider keeps discovery state** (`saveDiscoveryState`), which it uses to check the authorization came back from the server it went to.
- **The SDK accepts JSON Schema through `fromJsonSchema`**, validated with Ajv: the API's schemas are used as they are, with no Zod.
- **Most of `tools/list` is input schemas and structure**, not descriptions: dropping the API's limits from the outputs saved only about 7%. Fewer tools, and fewer properties, are what keep it small.

### Not covered

- Per-user data, and token exchange (RFC 8693) to call the API as the user.
- Client registration other than pre-registered clients: Client ID Metadata Documents (the spec's preferred way) need an `https` client id, and Dynamic Client Registration is deprecated.
- Resources, prompts, subscriptions (`subscriptions/listen`), elicitation and tasks.
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
| `notes login [--api <url>] [--client-id notes-cli]` | Logs in (opens a browser), and keeps the login |
| `notes logout` | Forgets the login |
| `notes list [--q <text>] [--limit 10]` | One line per note, newest first: id, time, title. Never bodies |
| `notes get <id>` | The note's title, a blank line, its body |
| `notes add --title <title> [--body <text> \| --stdin]` | Adds a note, and prints its id |

Every command takes `--json`, to print JSON for a program to read, and `--config-dir`, where the login is kept (`$NOTES_CONFIG_DIR`, else `$XDG_CONFIG_HOME/notes-demo`, else `~/.config/notes-demo`). `--api` defaults to `$NOTES_API_URL`.

### Made for agents

An agent with a shell can use any CLI, and a good one costs it very little: `notes list --q sheep` is a few tokens in and a line per note out, fully authorized, with the CLI doing the work an agent would otherwise spend context on.

- **Output is short by default**, and the same shape every time: a list is ids, times and titles, one per line; `get` is the title, then the body. `--json` when a program (or an agent that wants to parse it) reads it.
- **Nothing is asked interactively**, except the browser login: every input is a flag, with a default where one makes sense.
- **stdin is read only with `--stdin`.** An agent's shell may leave stdin open, and a CLI that reads it unasked waits forever.
- **The login is set up once, by a person**, and every command after just works: the CLI refreshes the token when it expires, and saves the new one. An agent never handles a token.
- **A failure is one line on stderr, saying what to do**, with exit code 1 (see [Errors](#errors)).

### Login

`notes login` needs only the API's URL. Everything else is discovered:

1. The API's Protected Resource Metadata (RFC 9728) names its authorization server, its scopes, and its canonical identifier.
2. The authorization server's metadata (RFC 8414) gives its endpoints.
3. The CLI listens on a free port of `127.0.0.1` (a loopback redirect, RFC 8252), and sends the user to authorize: the URL is printed, and opened with `$BROWSER` when it's set. PKCE (S256), a random `state`, and `resource` set to the API (RFC 8707), asking for every scope the API names.
4. The browser comes back to the loopback with a code. The CLI checks the `state`, and that the response came from the server it went to (`iss`, RFC 9207), then trades the code for tokens.
5. The access and refresh tokens are kept in `session.json`, readable only by its owner (`0600`, in a `0700` directory): a refresh token is as good as a password until it's revoked.

Before each request, an expired access token (30 seconds early) is refreshed, and the new tokens saved. The CLI is a public client (it can't keep a secret), so it has no client secret, and relies on PKCE. The OAuth is [oauth4webapi](https://github.com/panva/oauth4webapi), which checks each of these steps; plain HTTP is allowed only to this machine (`127.0.0.1`, `localhost`), for local development.

### Errors

| When | stderr |
|---|---|
| Not logged in | `Not logged in. Run notes login --api <url> first.` |
| The login expired, and can't be refreshed | `The login has expired, …. Run notes login again.` |
| The API refuses the token (`401`, `403`) | `The API refused the login (…). Run notes login again.` |
| The API refuses the input (`400`) | `The API refused it: …`, with the API's reason |
| No such note | `No note has the id …. notes list shows the ids there are.` |
| The login fails (denied, or a forged response) | `Login failed (…). Run notes login again.` |
| The URL isn't an API that says how to log in | `… doesn't say how to log in (…). Is it the notes API?` |
| Anything else (the API down, say) | `Failed: …` |
| A mistake in the command line | yargs's message, then `Run notes --help for usage.` |

### Testing

Each test runs `./bin.mjs` as a separate process, as anyone would, against a [dev OAuth server](/demos/oauth-server) and the [notes API](/demos/openapi#the-server) on a database of its own. `$BROWSER` is a small script playing the user: it signs in, asks for `/favicon.ico` as a browser would, and comes back to the CLI. It can come back with something else instead (a denial, a forged `state`), and a test can open the printed URL instead, as a user without `$BROWSER` would. Expiry is tested by editing the saved session, never by waiting.

### What was learned

- **yargs' `.fail()` doesn't see errors from async handlers**: they reject `parseAsync` instead. The CLI catches them there, so every failure is one line.
- **yargs reads `-` as an argument of its own**, not as `--body`'s value, so "read stdin" is a flag (`--stdin`).
- **The resource is the API's own identifier, as its metadata says**, not the URL typed: `http://api` and `http://api/` are different audiences to an authorization server.
- **`oauth4webapi` refuses plain HTTP** unless allowed per request: allowing it only for this machine keeps production HTTPS-only.

### Not covered

- Revoking tokens on logout (RFC 7009): `notes logout` only forgets them.
- Keeping the refresh token in the OS keychain rather than a file.
- A timeout on `notes login`, which waits until the browser comes back (Ctrl-C to cancel).
- The device authorization grant (RFC 8628), for machines with no browser.

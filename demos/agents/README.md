# Agents demo

How to make a REST API easy for AI agents to use, from both sides: an MCP server for agents that connect to services, and a CLI for agents with a shell, both on top of the [notes API](../openapi), authorized end to end with OAuth.

The thesis: an agent is good at wiring things together, but every call it makes costs context and a chance to go wrong. So the happy path should be one short, typed, authorized call per task, with the plumbing (discovery, tokens, refresh, mapping onto the API, errors) done for it on the other side.

```
agent ──MCP──► mcp ──(its own token)──┐
                                      ├──► notes API ──► Postgres
agent ──shell──► notes CLI ──(user's)─┘
       (both log in at the dev OAuth server; each server verifies its own tokens)
```

Worked examples, not packages: none is published. Each is a full package (lint, types, 100% coverage), tested against the real notes API, Postgres, and the [dev OAuth server](../oauth-server).

| Package | What it is | README |
|---|---|---|
| [`mcp`](./mcp) | An MCP server: three tools over the notes API, an OAuth resource server, and its own credentials for the API | [Tools, authorization, and what was learned](./mcp/README.md) |
| [`cli`](./cli) | `notes`: login once, then one short command per task, with tokens refreshed inside | [Commands, login, and errors](./cli/README.md) |

## Why each piece

- **MCP and a CLI are the two sides of the same idea.** MCP serves agents that connect to services; a CLI serves agents with a shell, where `notes list --q sheep` is a few tokens for a fully authorized request. Both keep the plumbing on their side.
- **The API stays an API.** The notes API is a REST API described by OpenAPI, unaware of agents. MCP is a different protocol (JSON-RPC on one endpoint, describing itself through `tools/list`), so it sits beside the API rather than inside it, and calls it like any other client would.
- **Tools are shaped for tasks, not mirrored from endpoints**: summaries by default, details on request, and the API's own constraints, read from `openapi.json`, so a tool can't accept what the API would reject.
- **Every hop has its own token.** The agent gets a token for the MCP server; the MCP server gets its own for the API. No token is passed on, and each server checks a token was issued for it (`aud`).
- **One authorization server, three kinds of token**: the agent's for the MCP server and the user's for the API (authorization code with PKCE, refresh tokens), and the MCP server's own (client credentials). The API names its authorization server (RFC 9728), so the CLI needs only its URL. The dev OAuth server runs the real flow locally; a Keycloak sidecar or a hosted provider could replace it by changing URLs.

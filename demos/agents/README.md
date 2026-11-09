# Agents demo

An AI agent is good at wiring things together, but every call it makes costs context, and is another chance to get something wrong. So the easy path for an agent should be one short, typed, authorized call per task, with the plumbing (discovery, tokens, refresh, mapping onto the API, and errors) handled for it on the other side.

This demo does that for the [notes API](../openapi) from both sides. An MCP server serves agents that connect to services, and a CLI serves agents that have a shell. Both are authorized end to end with OAuth, as the agent's user.

```
agent ──MCP──► mcp ──(exchanged)──────┐
                                      ├──► notes API ──► Postgres
agent ──shell──► notes CLI ──(user's)─┘
       (both log in at the dev OAuth server; each server verifies its own tokens)
```

These are worked examples, and none of them is published. Each is still a full package (lint, types, 100% coverage), tested against the real notes API, Postgres and the [dev OAuth server](../../tools/oauth-dev-server).

| Package | What it is | README |
|---|---|---|
| [`mcp`](./mcp) | An MCP server with three tools over the notes API, which checks OAuth tokens and calls the API as the agent's user (token exchange) | [Tools, authorization, and what was learned](./mcp/README.md) |
| [`cli`](./cli) | The `notes` CLI, where a person logs in once and then each task is one short command, with tokens refreshed inside | [Commands, login, and errors](./cli/README.md) |

## Why each piece

MCP and a CLI are two ways of doing the same thing. With a shell, `notes list --q sheep` costs an agent a few tokens for a fully authorized request, and an agent without one gets the same from MCP. In both cases the plumbing stays on the tool's side.

The notes API itself doesn't change for agents. It's a REST API described by OpenAPI, and it knows nothing about them. MCP is a different protocol (JSON-RPC on one endpoint, which describes itself through `tools/list`), so the MCP server sits beside the API rather than inside it, and calls it like any other client would.

The MCP tools are shaped around tasks rather than copied from the endpoints. They return summaries by default and details on request. Their inputs use the API's own constraints, read from `openapi.json`, so a tool can't accept anything the API would reject.

Every hop has its own token, all for the same user. The agent gets a token for the MCP server, and the MCP server exchanges it (RFC 8693) for a token for the API, for the same user and with no more scopes. No token is passed along as is, and each server checks that a token was issued for it (`aud`). The API shows each user only their own notes, whether they came through MCP or the CLI.

One authorization server issues all three kinds of token. The agent gets one for the MCP server and the CLI gets one for the API, both by authorization code with PKCE, with refresh tokens. The MCP server gets its token for the API by exchanging the agent's, with `act` saying the server is acting for the user. The API points to its authorization server (RFC 9728), so the CLI only needs the API's URL. The dev OAuth server runs the real flow locally, and a Keycloak sidecar or a hosted provider could replace it by changing URLs.

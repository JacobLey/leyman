---
description: A CLI that makes a REST API easy for AI agents with a shell. Each task is one short command, a person logs in once with OAuth (in a browser or with a device code), and the CLI handles tokens, refresh and errors.
---

# CLI for agents

<ProjectHeader />

A CLI for the notes API, made for agents as well as people, with one short command per task and login, tokens and errors handled inside.

An AI agent is good at wiring things together, but every call it makes costs context, and is another chance to get something wrong. An agent with a shell can run `notes list --q sheep` for a few tokens and get a fully authorized answer, as long as the CLI handles the plumbing (discovery, tokens, refresh and errors) itself.

This demo is that CLI, for the [notes API](/demos/openapi/). It's one of two demos that make the API easy for agents to use. The other, an [MCP server](/demos/mcp-server/), is for agents that connect to services instead.

```
agent ──shell──► notes CLI ──(the user's token)──► notes API ──► Postgres
        (the user logs in once at the dev OAuth server)
```

## Why each piece

A CLI does for an agent with a shell what MCP does for one that connects to services. In both, the plumbing stays on the tool's side, and the CLI costs an agent one command line in and one line per result out.

The API points to its authorization server (Protected Resource Metadata, RFC 9728), so the CLI only needs the API's URL, and works with any standard authorization server. The [dev OAuth server](https://github.com/JacobLey/leyman/tree/main/tools/oauth-dev-server) runs the real flow locally, and Keycloak or a hosted provider could replace it by changing URLs.

The CLI logs in as the user (by authorization code with PKCE, or with a device code) and asks for a token for the API only (`resource`). It refreshes the token itself, so an agent doesn't handle tokens at all. The API shows each user only their own notes.

This is a worked example rather than a package, and it isn't published. It's still a full package (lint, types, 100% coverage), tested against the real notes API, Postgres and the dev OAuth server.

## Example

```sh
$ notes login --api https://api.notes.example
Log in at: https://auth.example/auth?response_type=code&client_id=notes-cli&…
Logged in to https://api.notes.example

$ notes login --api https://api.notes.example --device   # on a machine with no browser
Log in at: https://auth.example/device?user_code=WDJB-MJHT
Code: WDJB-MJHT
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

## Commands

| Command                                                                        | Does                                                                                                                                                     |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notes login [--api <url>] [--client-id notes-cli] [--device] [--timeout 600]` | Logs in (opens a browser, or with `--device` prints a URL and code to approve on another device), waiting up to `--timeout` seconds, and keeps the login |
| `notes logout`                                                                 | Revokes the login, and forgets it                                                                                                                        |
| `notes list [--q <text>] [--limit 10]`                                         | One line per note, newest first: id, time, title. Never bodies                                                                                           |
| `notes get <id>`                                                               | The note's title, a blank line, its body                                                                                                                 |
| `notes add --title <title> [--body <text> \| --stdin]`                         | Adds a note, and prints its id. `--body` and `--stdin` can't both be given                                                                               |

Every command takes `--json`, to print JSON for a program to read, and `--config-dir`, where the login is kept (`$NOTES_CONFIG_DIR`, else `$XDG_CONFIG_HOME/notes-demo`, else `~/.config/notes-demo`). `--api` defaults to `$NOTES_API_URL`.

## Made for agents

An agent with a shell can use any CLI, and a well-made one costs it very little. `notes list --q sheep` is a few tokens in and one line per note out, for a fully authorized request, and the CLI does the work the agent would otherwise spend context on.

- Output is short by default, and the same shape every time. A list prints the id, time and title of each note, one per line, and `get` prints the title and then the body. Pass `--json` when a program (or an agent that wants to parse it) reads the output.
- Text written by users is printed escaped. A title or body could hold a terminal escape sequence (to recolor or rewrite what's shown) or a carriage return (to hide what came before it), so control characters are printed as JSON would print them (`\u001b`), except for a body's newlines and tabs. A newline in a title is escaped too, so a list stays one line per note.
- The CLI doesn't prompt, apart from the browser login. Every input is a flag, with a default where one makes sense.
- stdin is only read with `--stdin`. An agent's shell may leave stdin open, and a CLI that reads it without being asked would wait forever.
- A person sets up the login once, and later commands don't need them. The CLI refreshes the token when it expires and saves the new one, so an agent doesn't handle tokens at all.
- A failure is one line on stderr that says what to do, and the exit code says what kind of failure it was. It's `3` when only logging in again can fix it, so an agent can ask its user to log in without parsing the message (see [Errors](#errors)).

## Login

`notes login` only needs the API's URL, and discovers everything else:

1. The API's Protected Resource Metadata (RFC 9728) lists its authorization server, its scopes, and its canonical identifier.
2. The authorization server's metadata gives its endpoints: at RFC 8414's well-known URL, else at OpenID Connect's (which Keycloak serves instead), in the order the MCP spec gives.
3. The CLI listens on a free port of `127.0.0.1` (a loopback redirect, RFC 8252), and sends the user to authorize, by printing the URL and opening it with `$BROWSER` when that's set. The request uses PKCE (S256), a random `state`, and `resource` set to the API (RFC 8707), and asks for every scope the API names (or none, for the server's default, if the API names none). The CLI waits 10 minutes (`--timeout`) for the browser to come back.
4. The browser comes back to the loopback with a code. The CLI checks the `state`, and that the response came from the server it went to (`iss`, RFC 9207), then trades the code for tokens.
5. The access and refresh tokens are kept in `session.json`, readable only by its owner (`0600`, in a `0700` directory), because a refresh token is as good as a password until it's revoked. The file is written under a new name and renamed into place, so it's never half written, and never left readable by others, whatever the old file's mode was.

Before each request, the CLI refreshes an access token that has expired (counting from 30 seconds early, or half its life if that's shorter), and saves the new tokens. If the API refuses a token (`401`) before it expires, or the server gave the token no expiry, the CLI refreshes it once and tries the request again. Refreshing always goes to the issuer the login was made at, not to one the API names later.

Only one command refreshes at a time, holding `session.lock`. A command that had to wait reads the session again, and uses the token that was refreshed meanwhile. Without the lock, commands run at the same time (an agent's, in parallel) would each spend the same refresh token, and an authorization server that rotates refresh tokens treats a second use as a stolen token and revokes the login. A lock older than 30 seconds was left by a command that died, and is taken over.

`notes login --device` uses the device authorization grant (RFC 8628) instead, for a machine with no browser (a server, a container, an agent's sandbox). It asks the authorization server for a code, then prints the code and where to approve it (with the code in the URL, when the server gives one), and the user approves it on any device. Meanwhile the CLI polls for its tokens at the interval the server names (5 seconds when it names none), 5 seconds slower after each `slow_down`, until the login is approved or denied, or `--timeout` (or the code's expiry, if sooner) passes. The scopes and `resource` are the same as for a browser login. There's no redirect, so there's no PKCE or `state` either. The client must be allowed to use the grant, and the dev server doesn't allow it by default, because a device code can be phished.

`notes logout` revokes the refresh token (RFC 7009) at the issuer the login was made at, which ends the login there, so a copy of `session.json` can't be refreshed afterwards. The access token can't be revoked (it's a JWT that the API checks on its own), so it stays valid until it expires, minutes later. The login is forgotten locally even when revoking fails, and the CLI reports the failure. If the server can't revoke tokens at all (it names no revocation endpoint), the CLI says so on stderr.

Every request (discovery, tokens, the API) gives up after 10 seconds. The CLI is a public client, since it can't keep a secret, so it has no client secret and relies on PKCE instead. The OAuth is done by [oauth4webapi](https://github.com/panva/oauth4webapi), which checks each of these steps. Plain HTTP is only allowed to this machine (`127.0.0.1`, `localhost`), for local development.

## Errors

| When                                                                                   | stderr                                                                                       | Exit |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---- |
| Not logged in                                                                          | `Not logged in. Run notes login --api <url> first.`                                          | 3    |
| The login expired, and can't be refreshed (no refresh token, or the server refuses it) | `The login has expired, …. Run notes login again.`                                           | 3    |
| The API refuses the token (`401` after a refresh, `403`)                               | `The API refused the login (…). Run notes login again.`                                      | 3    |
| The login fails (denied, or a forged response)                                         | `Login failed (…). Run notes login again.`                                                   | 3    |
| The login isn't finished in time                                                       | `Login timed out after 600s. Run notes login again.`                                         | 3    |
| The API refuses the input (`400`)                                                      | `The API refused it: …`, with the API's reason                                               | 1    |
| No such note                                                                           | `No note has the id …. notes list shows the ids there are.`                                  | 1    |
| `--device`, at an authorization server that has no device authorization endpoint       | `… can't log in a device. Run notes login without --device.`                                 | 1    |
| The URL isn't an API that says how to log in                                           | `… doesn't say how to log in (…). Is it the notes API?`                                      | 1    |
| The authorization server can't be reached to refresh                                   | `Failed to refresh the login at … (…).`                                                      | 1    |
| Logging out, the authorization server can't be reached or refuses                      | `Logged out here, but … did not revoke the login (…): it stays good there until it expires.` | 1    |
| Anything else (the API down, say)                                                      | `Failed: …`                                                                                  | 1    |
| A mistake in the command line                                                          | yargs's message, then `Run notes --help for usage.`                                          | 2    |

## Testing

Each test runs `./bin.mjs` as a separate process, the way anyone would, against a [dev OAuth server](https://github.com/JacobLey/leyman/tree/main/tools/oauth-dev-server) and the [notes API](/demos/openapi/#the-server) on a database of its own. `$BROWSER` is a small script that plays the user. It signs in, asks for `/favicon.ico` as a browser would, and comes back to the CLI. It can also come back with something else (a denial, or a forged `state`), and a test can open the printed URL itself, as a user without `$BROWSER` would.

Expiry is tested by editing the saved session rather than by waiting. Logging out is tested by putting the session file back afterwards and checking it can't be refreshed. Running commands at the same time is tested by running four at once, and without the lock, three of them find the login revoked. Two users, each logged in from their own config directory (`$BROWSER` signs in as `BROWSER_USER`), see only their own notes.

A device login is approved (or denied) by the dev server's `approveDevice`, standing in for the user opening the printed URL elsewhere. A fake authorization server answers each poll the way a test asks (`slow_down`, a gateway error), which the dev server doesn't do. One test logs in at a server that publishes only the minimum the standards require (OpenID discovery only, no scopes, no `iss`, and tokens with no expiry or refresh token), and the CLI has to work with that too.

## What was learned

- yargs' `.fail()` doesn't see errors thrown by async handlers, which reject `parseAsync` instead. The CLI catches them there, so every failure is still one line.
- yargs reads `-` as an argument of its own rather than as the value of `--body`, so reading stdin is a flag (`--stdin`).
- yargs treats a default as if it were given, so `--stdin` defaulting to `false` would conflict with every `--body`. It has no default.
- oidc-provider revokes a login whose refresh token is used twice, as RFC 9700 advises for rotated refresh tokens. Two commands refreshing at once would log the user out, which is why there's a lock.
- The resource sent to the authorization server is the API's own identifier from its metadata, rather than the URL typed in, because `http://api` and `http://api/` are different audiences to an authorization server.
- `oauth4webapi` refuses plain HTTP unless it's allowed per request. Allowing it only for this machine keeps production HTTPS-only.

## Not covered

- Keeping the refresh token in the OS keychain rather than a file.
- OpenID Connect's metadata inserted after the host (`/.well-known/openid-configuration/<path>`), which is third in the MCP spec's order. Only RFC 8414's URL and OpenID's usual one are tried.
- Two commands taking over a stale lock at the same moment, in which case both could refresh.

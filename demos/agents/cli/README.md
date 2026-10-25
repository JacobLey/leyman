# demo-agents-cli

A CLI for the notes API, made for agents and people: one short command per task, with login, tokens and errors handled inside.

Part of the [agents demo](../README.md). A worked example, never published.

## Contents
- [Example](#example)
- [Commands](#commands)
- [Made for agents](#made-for-agents)
- [Login](#login)
- [Errors](#errors)
- [Testing](#testing)
- [What was learned](#what-was-learned)
- [Not covered](#not-covered)

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

| Command | Does |
|---|---|
| `notes login [--api <url>] [--client-id notes-cli] [--device] [--timeout 600]` | Logs in (opens a browser, or with `--device` prints a URL and code to approve on another device), waiting up to `--timeout` seconds, and keeps the login |
| `notes logout` | Revokes the login, and forgets it |
| `notes list [--q <text>] [--limit 10]` | One line per note, newest first: id, time, title. Never bodies |
| `notes get <id>` | The note's title, a blank line, its body |
| `notes add --title <title> [--body <text> \| --stdin]` | Adds a note, and prints its id. `--body` and `--stdin` can't both be given |

Every command takes `--json`, to print JSON for a program to read, and `--config-dir`, where the login is kept (`$NOTES_CONFIG_DIR`, else `$XDG_CONFIG_HOME/notes-demo`, else `~/.config/notes-demo`). `--api` defaults to `$NOTES_API_URL`.

## Made for agents

An agent with a shell can use any CLI, and a good one costs it very little: `notes list --q sheep` is a few tokens in and a line per note out, fully authorized, with the CLI doing the work an agent would otherwise spend context on.

- **Output is short by default**, and the same shape every time: a list is ids, times and titles, one per line; `get` is the title, then the body. `--json` when a program (or an agent that wants to parse it) reads it.
- **Users' text is printed escaped.** A title or body could hold a terminal escape sequence (to recolour or rewrite what's shown) or a carriage return (to hide what came before): control characters are printed as JSON would (`\u001b`), but for a body's newlines and tabs. A title's newline is escaped too, so a list stays one line per note.
- **The CLI never prompts**, except the browser login: every input is a flag, with a default where one makes sense.
- **stdin is read only with `--stdin`.** An agent's shell may leave stdin open, and a CLI that reads it unasked waits forever.
- **The login is set up once, by a person**, and later commands don't need it: the CLI refreshes the token when it expires, and saves the new one. An agent never handles a token.
- **A failure is one line on stderr, saying what to do**, and its exit code says what kind it is: `3` when only logging in again can fix it, so an agent can ask its user to without parsing the message (see [Errors](#errors)).

## Login

`notes login` needs only the API's URL. Everything else is discovered:

1. The API's Protected Resource Metadata (RFC 9728) lists its authorization server, its scopes, and its canonical identifier.
2. The authorization server's metadata gives its endpoints: at RFC 8414's well-known URL, else at OpenID Connect's (which Keycloak serves instead), in the order the MCP spec gives.
3. The CLI listens on a free port of `127.0.0.1` (a loopback redirect, RFC 8252), and sends the user to authorize: the URL is printed, and opened with `$BROWSER` when it's set. PKCE (S256), a random `state`, and `resource` set to the API (RFC 8707), asking for every scope the API names (or none, for the server's default, if it names none). It waits 10 minutes (`--timeout`) for the browser to come back.
4. The browser comes back to the loopback with a code. The CLI checks the `state`, and that the response came from the server it went to (`iss`, RFC 9207), then trades the code for tokens.
5. The access and refresh tokens are kept in `session.json`, readable only by its owner (`0600`, in a `0700` directory): a refresh token is as good as a password until it's revoked. It's written to a new file and renamed into place, so it's never half written, and never left readable by others, whatever the old file's mode was.

Before each request, an expired access token (30 seconds early, or half its life if that's shorter) is refreshed, and the new tokens saved. A token the API refuses (`401`) before it expires, or one the server gave no expiry for, is refreshed once, and the request tried again. Refreshing goes to the issuer the login was made at, never one the API names since.

One command refreshes at a time, holding `session.lock`; a command that waited reads the session again, and uses the token refreshed meanwhile. Commands run at once (an agent's, in parallel) would otherwise each spend the same refresh token, and an authorization server that rotates them takes a second use as a stolen token, and revokes the login. A lock older than 30 seconds was left by a command that died, and is taken over.

`notes login --device` uses the device authorization grant (RFC 8628) instead, for a machine with no browser (a server, a container, an agent's sandbox). It asks the authorization server for a code, and prints where to approve it (with the code in the URL, when the server gives one) and the code, for the user to check there: the user approves on any device. Meanwhile the CLI polls for its tokens at the interval the server names (5 seconds when it names none), 5 seconds slower after each `slow_down`, until approved, denied, or `--timeout` (or the code's expiry, if sooner) passes. The scopes and `resource` are the same; there's no redirect, so no PKCE or `state`. The client must be allowed the grant: the dev server doesn't allow it by default, as a device code can be phished.

`notes logout` revokes the refresh token (RFC 7009) at the issuer the login was made at, which revokes the login there: a copy of `session.json` can't be refreshed after. The access token can't be revoked (it's a JWT the API checks by itself), so it stays good until it expires, minutes later. The login is forgotten here even when revoking fails, and the failure said; a server that can't revoke tokens (it names no revocation endpoint) is said on stderr.

Every request (discovery, tokens, the API) gives up after 10 seconds. The CLI is a public client (it can't keep a secret), so it has no client secret, and relies on PKCE. The OAuth is [oauth4webapi](https://github.com/panva/oauth4webapi), which checks each of these steps; plain HTTP is allowed only to this machine (`127.0.0.1`, `localhost`), for local development.

## Errors

| When | stderr | Exit |
|---|---|---|
| Not logged in | `Not logged in. Run notes login --api <url> first.` | 3 |
| The login expired, and can't be refreshed (no refresh token, or the server refuses it) | `The login has expired, …. Run notes login again.` | 3 |
| The API refuses the token (`401` after a refresh, `403`) | `The API refused the login (…). Run notes login again.` | 3 |
| The login fails (denied, or a forged response) | `Login failed (…). Run notes login again.` | 3 |
| The login isn't finished in time | `Login timed out after 600s. Run notes login again.` | 3 |
| The API refuses the input (`400`) | `The API refused it: …`, with the API's reason | 1 |
| No such note | `No note has the id …. notes list shows the ids there are.` | 1 |
| `--device`, at an authorization server that has no device authorization endpoint | `… can't log in a device. Run notes login without --device.` | 1 |
| The URL isn't an API that says how to log in | `… doesn't say how to log in (…). Is it the notes API?` | 1 |
| The authorization server can't be reached to refresh | `Failed to refresh the login at … (…).` | 1 |
| Logging out, the authorization server can't be reached or refuses | `Logged out here, but … did not revoke the login (…): it stays good there until it expires.` | 1 |
| Anything else (the API down, say) | `Failed: …` | 1 |
| A mistake in the command line | yargs's message, then `Run notes --help for usage.` | 2 |

## Testing

Each test runs `./bin.mjs` as a separate process, as anyone would, against a [dev OAuth server](../../../tools/oauth-dev-server) and the [notes API](../../openapi/server) on a database of its own. `$BROWSER` is a small script playing the user: it signs in, asks for `/favicon.ico` as a browser would, and comes back to the CLI. It can come back with something else instead (a denial, a forged `state`), and a test can open the printed URL instead, as a user without `$BROWSER` would. Expiry is tested by editing the saved session, never by waiting, and logging out by putting the session file back after: it can't be refreshed. Commands run at once are tested too, by running four: without the lock, three of them find the login revoked. Two users, each logged in from a config directory of their own (`$BROWSER` signs in as `BROWSER_USER`), see only their own notes. A device login is approved (or denied) by the dev server's `approveDevice`, as the user opening the printed URL elsewhere; a fake authorization server answers each poll as a test asks (`slow_down`, a gateway error), as the dev server never does. One test logs in at a server that publishes only the minimum the standards require (OpenID discovery only, no scopes, no `iss`, tokens with no expiry or refresh token), which the CLI must still work with.

## What was learned

- **yargs' `.fail()` doesn't see errors from async handlers**: they reject `parseAsync` instead. The CLI catches them there, so every failure is one line.
- **yargs reads `-` as an argument of its own**, not as `--body`'s value, so "read stdin" is a flag (`--stdin`).
- **yargs takes a default as given**: `--stdin` defaulting to `false` conflicts with every `--body`, so it has no default.
- **oidc-provider revokes a login whose refresh token is used twice**, as RFC 9700 advises for rotated refresh tokens: two commands refreshing at once log the user out, hence the lock.
- **The resource is the API's own identifier, as its metadata says**, not the URL typed: `http://api` and `http://api/` are different audiences to an authorization server.
- **`oauth4webapi` refuses plain HTTP** unless allowed per request: allowing it only for this machine keeps production HTTPS-only.

## Not covered

- Keeping the refresh token in the OS keychain rather than a file.
- OpenID Connect's metadata inserted after the host (`/.well-known/openid-configuration/<path>`), third in the MCP spec's order: only RFC 8414's and OpenID's usual URL are tried.
- A lock taken over by two commands at once: each could then refresh.

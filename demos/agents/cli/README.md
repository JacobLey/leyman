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
| `notes login [--api <url>] [--client-id notes-cli]` | Logs in (opens a browser), and keeps the login |
| `notes logout` | Forgets the login |
| `notes list [--q <text>] [--limit 10]` | One line per note, newest first: id, time, title. Never bodies |
| `notes get <id>` | The note's title, a blank line, its body |
| `notes add --title <title> [--body <text> \| --stdin]` | Adds a note, and prints its id |

Every command takes `--json`, to print JSON for a program to read, and `--config-dir`, where the login is kept (`$NOTES_CONFIG_DIR`, else `$XDG_CONFIG_HOME/notes-demo`, else `~/.config/notes-demo`). `--api` defaults to `$NOTES_API_URL`.

## Made for agents

An agent with a shell can use any CLI, and a good one costs it very little: `notes list --q sheep` is a few tokens in and a line per note out, fully authorized, with the CLI doing the work an agent would otherwise spend context on.

- **Output is short by default**, and the same shape every time: a list is ids, times and titles, one per line; `get` is the title, then the body. `--json` when a program (or an agent that wants to parse it) reads it.
- **Nothing is asked interactively**, except the browser login: every input is a flag, with a default where one makes sense.
- **stdin is read only with `--stdin`.** An agent's shell may leave stdin open, and a CLI that reads it unasked waits forever.
- **The login is set up once, by a person**, and every command after just works: the CLI refreshes the token when it expires, and saves the new one. An agent never handles a token.
- **A failure is one line on stderr, saying what to do**, with exit code 1 (see [Errors](#errors)).

## Login

`notes login` needs only the API's URL. Everything else is discovered:

1. The API's Protected Resource Metadata (RFC 9728) names its authorization server, its scopes, and its canonical identifier.
2. The authorization server's metadata (RFC 8414) gives its endpoints.
3. The CLI listens on a free port of `127.0.0.1` (a loopback redirect, RFC 8252), and sends the user to authorize: the URL is printed, and opened with `$BROWSER` when it's set. PKCE (S256), a random `state`, and `resource` set to the API (RFC 8707), asking for every scope the API names.
4. The browser comes back to the loopback with a code. The CLI checks the `state`, and that the response came from the server it went to (`iss`, RFC 9207), then trades the code for tokens.
5. The access and refresh tokens are kept in `session.json`, readable only by its owner (`0600`, in a `0700` directory): a refresh token is as good as a password until it's revoked.

Before each request, an expired access token (30 seconds early) is refreshed, and the new tokens saved. The CLI is a public client (it can't keep a secret), so it has no client secret, and relies on PKCE. The OAuth is [oauth4webapi](https://github.com/panva/oauth4webapi), which checks each of these steps; plain HTTP is allowed only to this machine (`127.0.0.1`, `localhost`), for local development.

## Errors

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

## Testing

Each test runs `./bin.mjs` as a separate process, as anyone would, against a [dev OAuth server](../../oauth-server) and the [notes API](../../openapi/server) on a database of its own. `$BROWSER` is a small script playing the user: it signs in, asks for `/favicon.ico` as a browser would, and comes back to the CLI. It can come back with something else instead (a denial, a forged `state`), and a test can open the printed URL instead, as a user without `$BROWSER` would. Expiry is tested by editing the saved session, never by waiting.

## What was learned

- **yargs' `.fail()` doesn't see errors from async handlers**: they reject `parseAsync` instead. The CLI catches them there, so every failure is one line.
- **yargs reads `-` as an argument of its own**, not as `--body`'s value, so "read stdin" is a flag (`--stdin`).
- **The resource is the API's own identifier, as its metadata says**, not the URL typed: `http://api` and `http://api/` are different audiences to an authorization server.
- **`oauth4webapi` refuses plain HTTP** unless allowed per request: allowing it only for this machine keeps production HTTPS-only.

## Not covered

- Revoking tokens on logout (RFC 7009): `notes logout` only forgets them.
- Keeping the refresh token in the OS keychain rather than a file.
- A timeout on `notes login`, which waits until the browser comes back (Ctrl-C to cancel).
- The device authorization grant (RFC 8628), for machines with no browser.

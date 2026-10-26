# demo-local-ingress

A Vite dev server behind [`tools/local-ingress`](../../tools/local-ingress): each worktree at `https://<worktree>.<repo>.localhost`, with hot reload through the proxy.

A worked example, not a package: it is never published. It is the proof that a frontend's dev server works behind the machine's shared HTTPS ingress: routing by host name, TLS from the local CA, and the hot reload WebSocket all go through Caddy, and a page in one worktree can't see another's cookies. The page itself only says which worktree and repo it was loaded from. This README is the write-up: what a dev server needs (very little), and what was learned.

## Contents
- [Running it](#running-it)
- [The Vite settings](#the-vite-settings)
- [Names on the page](#names-on-the-page)
- [Why Caddy and caddy-docker-proxy](#why-caddy-and-caddy-docker-proxy)
- [Cookies stay per worktree](#cookies-stay-per-worktree)
- [Absolute URLs](#absolute-urls)
- [Not covered](#not-covered)
- [Testing](#testing)

## Running it

In a devcontainer, whose `leyman` service is labelled for the ingress (see the [worktrees skill](../../.claude/skills/worktrees/SKILL.md#urls)):

```sh
nx run @leyman/demo-local-ingress:dev
```

Then open `https://<worktree>.leyman.localhost` (`scripts/worktree up` prints it). The page reads "You are loading **<worktree>** in **leyman**". Edit `src/page.ts` and the page reloads with the change. The first time on a machine, trust the CA from `http://ingress.localhost`.

To reach it from a phone, start a tunnel and set `TUNNEL_HOST` (see [the ingress's tunnels](../../tools/local-ingress/README.md#tunnels)). Vite accepts the tunnel's host through `server.allowedHosts`, and its hot reload goes through the tunnel too.

`dev` builds the package first: `vite.config.js` imports the config from `dist/`, where it is compiled from `src/vite-config.ts` and tested.

### Without the devcontainer

With only Docker (and git) on the host, no Node, pnpm or Nx:

```sh
demos/local-ingress/run
```

It starts the ingress if needed (it refuses to start twice for one worktree), then runs the dev server in a container on the `local-ingress` network, at `https://demo.<worktree>.leyman.localhost`. That's a name of its own, so it never shares a host with the devcontainer's `https://<worktree>.leyman.localhost`. Inside, it installs only the lockfile's `vite` (its dependencies held to the 7-day rule with `npm install --before`). Node loads `src/vite-config.ts` with its types stripped, which `erasableSyntaxOnly` in `tsconfig.json` keeps possible, so nothing is built first. The checkout is mounted read-only, edits still reload the page, and Ctrl-C removes the container. `TUNNEL_HOST=<host> demos/local-ingress/run` serves a tunnel's host as well.

## The Vite settings

Everything is in [`src/vite-config.ts`](src/vite-config.ts), and it's short, because Vite 8 already does most of it:

| Setting | Why |
|---|---|
| `server.host: '0.0.0.0'` | The ingress reaches the container at its address on the `local-ingress` network. Vite's default, `localhost`, only answers inside the container |
| `server.port: 5173`, `strictPort: true` | The port the devcontainer's labels name. Without `strictPort`, a taken port makes Vite quietly move to another, which the ingress doesn't know about |
| `server.allowedHosts` | Only for a tunnel host (`TUNNEL_HOST`). Vite accepts `localhost` and `*.localhost` by default, so the ingress's hosts need nothing |
| The hot reload WebSocket | **Nothing.** Vite's client connects to the page's own host and port (`wss://<worktree>.<repo>.localhost`, port 443 or the ingress's override), and Caddy proxies the upgrade like any request |

Guides for running Vite behind a proxy often set `server.hmr.clientPort: 443`. Don't: in Vite 8 it's deprecated (for `server.ws.*`), and it's only needed when the WebSocket must use a different port from the page. Pinning 443 would also break hot reload when the ingress runs on another port.

## Names on the page

`initialize.sh` writes `WORKTREE_NAME` and `REPO_NAME` (DNS labels) into the devcontainer's environment. A small plugin, `worktreeNamesPlugin`, writes them into `index.html` as `<meta name="worktree">` and `<meta name="repo">`, and [`src/page.ts`](src/page.ts) puts them in the heading as text, never as HTML.

`define` or `import.meta.env` would work too, but they put the values in compiled JavaScript, where a test in Node can't reach them without Vite. A `<meta>` tag keeps the page's code an ordinary function of the `document`.

## Why Caddy and caddy-docker-proxy

The ingress is one Caddy for the whole machine, configured by Docker labels through caddy-docker-proxy (see [its README](../../tools/local-ingress/README.md#compared-to-alternatives) for the alternatives). For a dev server, what matters is:

- **WebSockets need no configuration.** Caddy's `reverse_proxy` passes `Upgrade` requests through. nginx needs `proxy_set_header Upgrade` and `Connection` set by hand.
- **A container joins by labels and leaves by stopping**, with no restart of the proxy and no file to edit.
- **Certificates come from Caddy's own CA**, per host and renewed automatically: no mkcert, and no wildcard certificate, which browsers refuse for `*.localhost`.

## Cookies stay per worktree

Every worktree is its own origin, so its cookies, storage and service workers are its own, as long as cookies stay **host-only**: never set `Domain=.<repo>.localhost`. Browsers accept that attribute (Chromium was checked), and the cookie then goes to every worktree of the repo.

## Absolute URLs

Caddy sends `X-Forwarded-Host` (with the port, when the ingress runs on another one) and `X-Forwarded-Proto: https`. A server that builds absolute URLs (redirects, OAuth redirect URIs, links in emails) should build them from those headers, from requests that came through the ingress, rather than from its own `Host` or a configured origin. Then the same code is right at `https://feat-x.leyman.localhost`, at a tunnel's host, and in production. This demo has no server code of its own, so it only notes the rule.

## Not covered

- **A production build.** Only the dev server is shown: `vite build` output is static files, served by whatever serves them.
- **Frameworks.** Vanilla TypeScript only. Most frameworks' dev servers are Vite's (SvelteKit, Nuxt, Astro, React Router, SolidStart), so these settings carry over. Next.js runs its own server and needs its own check (`allowedDevOrigins`).
- **haywire.** Unlike the other demos, nothing here composes at runtime: a Vite config is a value, built by functions that are tested directly.

## Testing

- Unit tests check the config's settings, the plugin's tags, and the page in [happy-dom](https://github.com/capricorn86/happy-dom): both names shown, as text, and a fallback when either is missing.
- An integration test starts a real Vite dev server from the config (on a free port) and requests it as the ingress does, with a worktree's `Host`: the page has both names, the entry compiles, the hot reload client uses the page's own port, a tunnel host is accepted and any other host refused.
- The path through Caddy itself was checked by hand, in Chromium through a running ingress: the page rendered both names, Vite's client connected to `wss://<host>:<ingress port>`, and editing `src/page.ts` reloaded the page with the change. The CI runner has no ingress, so this isn't automated.

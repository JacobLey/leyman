# demo-local-ingress

A Vite dev server behind [`tools/local-ingress`](../../tools/local-ingress), so each worktree is served at `https://<worktree>.<repo>.localhost` with hot reload through the proxy.

The machine's shared ingress is a single Caddy that serves every worktree over HTTPS, routing by host name. This demo checks that a frontend's dev server really works behind it. Routing by host name, TLS from the local CA and the hot reload WebSocket all go through Caddy, and a page in one worktree can't see another worktree's cookies.

The page itself only says which worktree and repo it was loaded from. It's a worked example rather than a package, and isn't published. This README covers what a dev server needs to work behind the ingress (very little), and what was learned along the way.

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

In a devcontainer, whose `leyman` service is labeled for the ingress (see the [worktrees skill](../../.agents/skills/worktrees/SKILL.md#urls)):

```sh
serve   # scripts/commands/serve: nx run @leyman/demo-local-ingress:dev --tui=false
```

Then open `https://<worktree>.leyman.localhost` (`scripts/worktree up` prints it). The page reads "You are loading **<worktree>** in **leyman**". Edit `src/page.ts` and the page reloads with the change. The first time on a machine, trust the CA from `http://ingress.localhost`.

To reach it from a phone, start a tunnel and set `TUNNEL_HOST` (see [the ingress's tunnels](../../tools/local-ingress/README.md#tunnels)). Vite accepts the tunnel's host through `server.allowedHosts`, and its hot reload goes through the tunnel too.

`dev` builds the package first, because `vite.config.js` imports the config from `dist/`, where it's compiled from `src/vite-config.ts` and tested.

### Without the devcontainer

With only Docker (and git) on the host, no Node, pnpm or Nx:

```sh
demos/local-ingress/run
```

It starts the ingress if needed (it refuses to start twice for one worktree), then runs the dev server in a container on the `local-ingress` network, at `https://demo.<worktree>.leyman.localhost`. That's a name of its own, so it doesn't clash with the devcontainer's `https://<worktree>.leyman.localhost`. Inside the container, it installs only the lockfile's `vite` (with its dependencies held to the 7-day rule by `npm install --before`). Node loads `src/vite-config.ts` with its types stripped, which `erasableSyntaxOnly` in `tsconfig.json` keeps possible, so nothing is built first. The checkout is mounted read-only, edits still reload the page, and Ctrl-C removes the container. `TUNNEL_HOST=<host> demos/local-ingress/run` serves a tunnel's host as well.

## The Vite settings

Everything is in [`src/vite-config.ts`](src/vite-config.ts), and it's short, because Vite 8 already does most of it:

| Setting                                 | Why                                                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `server.host: '0.0.0.0'`                | The ingress reaches the container at its address on the `local-ingress` network. Vite's default, `localhost`, only answers inside the container                                                  |
| `server.port: 5173`, `strictPort: true` | The port the devcontainer's labels name. Without `strictPort`, a taken port makes Vite quietly move to another, which the ingress doesn't know about                                             |
| `server.allowedHosts`                   | Only for a tunnel host (`TUNNEL_HOST`). Vite accepts `localhost` and `*.localhost` by default, so the ingress's hosts need nothing                                                               |
| The hot reload WebSocket                | Nothing to set. Vite's client connects to the page's own host and port (`wss://<worktree>.<repo>.localhost`, port 443 or the ingress's override), and Caddy proxies the upgrade like any request |

Guides for running Vite behind a proxy often set `server.hmr.clientPort: 443`, but you shouldn't. It's deprecated in Vite 8 (in favor of `server.ws.*`), and it's only needed when the WebSocket has to use a different port from the page. Pinning 443 would also break hot reload when the ingress runs on another port.

## Names on the page

`initialize.sh` writes `WORKTREE_NAME` and `REPO_NAME` (DNS labels) into the devcontainer's environment. A small plugin, `worktreeNamesPlugin`, writes them into `index.html` as `<meta name="worktree">` and `<meta name="repo">`, and [`src/page.ts`](src/page.ts) puts them in the heading as text rather than HTML.

`define` or `import.meta.env` would work too, but they put the values in compiled JavaScript, where a test in Node can't reach them without Vite. With a `<meta>` tag, the page's code stays an ordinary function of the `document`.

## Why Caddy and caddy-docker-proxy

The ingress is one Caddy for the whole machine, configured by Docker labels through caddy-docker-proxy (see [its README](../../tools/local-ingress/README.md#compared-to-alternatives) for the alternatives). For a dev server, three things about it matter.

- WebSockets need no configuration, because Caddy's `reverse_proxy` passes `Upgrade` requests through. nginx needs `proxy_set_header Upgrade` and `Connection` set by hand.
- A container joins by its labels and leaves by stopping, without restarting the proxy or editing a file.
- Certificates come from Caddy's own CA, issued per host and renewed automatically. There's no mkcert, and no wildcard certificate, which browsers refuse for `*.localhost`.

## Cookies stay per worktree

Every worktree is its own origin, so it has its own cookies, storage and service workers, as long as cookies stay host-only. Don't set `Domain=.<repo>.localhost` on a cookie. Browsers accept that attribute (Chromium was checked), and the cookie is then sent to every worktree of the repo.

## Absolute URLs

Caddy sends `X-Forwarded-Host` (with the port, when the ingress runs on another one) and `X-Forwarded-Proto: https`. A server that builds absolute URLs (redirects, OAuth redirect URIs, links in emails) should build them from those headers, from requests that came through the ingress, rather than from its own `Host` or a configured origin. Then the same code is right at `https://feat-x.leyman.localhost`, at a tunnel's host, and in production. This demo has no server code of its own, so it only notes the rule.

## Not covered

- A production build. Only the dev server is shown, since `vite build` output is static files, served by whatever serves them.
- Frameworks. The page is vanilla TypeScript. Most frameworks' dev servers are Vite's (SvelteKit, Nuxt, Astro, React Router, SolidStart), so these settings carry over. Next.js runs its own server and needs its own check (`allowedDevOrigins`).
- haywire. Unlike the other demos, nothing here composes at runtime. A Vite config is a value, built by functions that are tested directly.

## Testing

- Unit tests check the config's settings, the plugin's tags, and the page in [happy-dom](https://github.com/capricorn86/happy-dom), which shows both names as text, with a fallback when either is missing.
- An integration test starts a real Vite dev server from the config (on a free port) and requests it the way the ingress does, with a worktree's `Host`. It checks that the page has both names, the entry compiles, the hot reload client uses the page's own port, and a tunnel host is accepted while any other host is refused.
- The path through Caddy itself was checked by hand, in Chromium through a running ingress. The page rendered both names, Vite's client connected to `wss://<host>:<ingress port>`, and editing `src/page.ts` reloaded the page with the change. The CI runner has no ingress, so this isn't automated.

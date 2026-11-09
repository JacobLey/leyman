---
description: A Vite dev server behind one machine-wide Caddy, so every worktree is at its own https://<worktree>.<repo>.localhost, with a locally trusted certificate and hot reload through the proxy.
---

# Local ingress

<ProjectHeader />

With [`tools/local-ingress`](https://github.com/JacobLey/leyman/tree/main/tools/local-ingress), every worktree's dev server gets an HTTPS address shaped like a production one, `https://<worktree>.<repo>.localhost`. One Caddy per machine routes each host name to the devcontainer labeled with it, and this demo checks that a frontend's dev server works behind it. The page itself only says which worktree and repo it was loaded from.

```
browser ──► https://feat-x.leyman.localhost ──► local-ingress (Caddy, 127.0.0.1:443) ──► feat-x's devcontainer :5173
        ──► https://main.leyman.localhost   ──┘                                     └──► main's devcontainer   :5173
```

It's a worked example rather than a package, and isn't published.

## What it proves

- Requests are routed by host name. Every worktree's dev server listens on the same port, 5173, in its own container, and the ingress tells them apart by name, so worktrees don't compete for a port.
- HTTPS works without any tooling on the host. Certificates come from a CA that Caddy creates on the machine. Its root is trusted once, and leaf certificates are issued per host and renewed automatically. Browsers resolve `*.localhost` to loopback themselves ([RFC 6761](https://www.rfc-editor.org/rfc/rfc6761#section-6.3)), so there's no DNS or `/etc/hosts` to edit. Chrome, Safari and Firefox were checked.
- Hot reload works through the proxy, since Vite's WebSocket goes through Caddy like any other request.
- Each worktree is a separate origin, with its own cookies, storage and service workers.

## Running it

In a devcontainer, whose container is labeled for the ingress:

```sh
serve   # scripts/commands/serve: nx run @leyman/demo-local-ingress:dev --tui=false
```

Then open `https://<worktree>.leyman.localhost`. The page reads "You are loading **&lt;worktree&gt;** in **leyman**", and editing `src/page.ts` reloads it. The devcontainer starts the ingress itself. The first time on a machine, trust the CA from `http://ingress.localhost`, which is the one page served over plain HTTP, with the root certificate and the steps for each OS and browser. Firefox keeps its own trust store, so it needs a step of its own.

With only Docker on the host (no Node, pnpm or Nx), `demos/local-ingress/run` runs the dev server in a container on the ingress's network instead, at `https://demo.<worktree>.leyman.localhost`. That's a name of its own, so it doesn't clash with the devcontainer's. Node loads the TypeScript config with its types stripped, so nothing is built first.

## The Vite settings

Everything is in [`src/vite-config.ts`](https://github.com/JacobLey/leyman/blob/main/demos/local-ingress/src/vite-config.ts), and it's short, because Vite 8 already does most of it:

| Setting                                 | Why                                                                                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.host: '0.0.0.0'`                | The ingress reaches the container at its address on the `local-ingress` network. Vite's default, `localhost`, only answers inside the container      |
| `server.port: 5173`, `strictPort: true` | The port the devcontainer's labels name. Without `strictPort`, a taken port makes Vite quietly move to another, which the ingress doesn't know about |
| `server.allowedHosts`                   | Only for a tunnel's host (`TUNNEL_HOST`). Vite accepts `localhost` and `*.localhost` by default, so the ingress's hosts need nothing                 |
| The hot reload WebSocket                | Nothing to set. Vite's client connects to the page's own host and port, which are the ingress's, and Caddy proxies the upgrade                       |

Guides for running Vite behind a proxy often set `server.hmr.clientPort: 443`, but you shouldn't. It's deprecated in Vite 8, and it's only needed when the WebSocket has to use a different port from the page. Pinning 443 would also break hot reload when the ingress runs on another port.

## Why Caddy

The ingress is [Caddy](https://caddyserver.com/) configured by Docker labels through [caddy-docker-proxy](https://github.com/lucaslorentz/caddy-docker-proxy). For a dev server, three things about it matter.

- WebSockets need no configuration, because Caddy's `reverse_proxy` passes `Upgrade` requests through. nginx needs `proxy_set_header Upgrade` and `Connection` set by hand.
- A container joins by its labels and leaves by stopping, without restarting the proxy or editing a file.
- Certificates come from Caddy's own CA, issued per host. There's no mkcert, and no wildcard certificate, which browsers refuse for `*.localhost`.

Each of the alternatives lacks one of these. nginx-proxy needs mkcert or a companion container for certificates, Traefik has no internal CA, OrbStack's domains only work in OrbStack, and localias and puma-dev are installed on the host.

One ingress serves every worktree, whatever branch it's on, so the ingress is versioned. Its image holds its whole configuration, and a checkout can upgrade it but won't downgrade it. The CA lives in a volume that upgrades don't touch.

## Cookies stay per worktree

Every worktree is its own origin, as long as cookies stay host-only. Don't set `Domain=.<repo>.localhost` on a cookie. Browsers accept that attribute (Chromium was checked), and the cookie is then sent to every worktree of the repo.

## Absolute URLs

Caddy sends `X-Forwarded-Host` and `X-Forwarded-Proto: https`. A server that builds absolute URLs (redirects, OAuth redirect URIs, links in emails) should build them from those headers, rather than from its own `Host` or a configured origin. Then the same code is right at `https://feat-x.leyman.localhost`, at a tunnel's host, and in production. This demo has no server code of its own, so it only notes the rule.

## Tunnels

The ingress only listens on loopback, so a phone reaches a worktree through a tunnel you bring yourself (cloudflared, ngrok). The phone sees the tunnel's public certificate, so it doesn't need the local CA. A tunnel connects to the ingress over HTTPS as the worktree's `.localhost` name, and can handle the host in one of two ways.

- It can rewrite `Host` to the `.localhost` name. That needs no setup, but the app then builds `.localhost` URLs that the phone can't load.
- It can keep its own public host, set as `TUNNEL_HOST` for the worktree. The worktree then serves that host too, and the app sees it, as it would in production.

Both were checked with cloudflared quick tunnels. The page, its modules and hot reload all worked through the tunnel, and Vite refused the tunnel's host until it was in `TUNNEL_HOST`. The recipes are in [the ingress's README](https://github.com/JacobLey/leyman/tree/main/tools/local-ingress#tunnels).

## Not covered

- A production build. Only the dev server is shown, since `vite build` output is static files, served by whatever serves them.
- Frameworks. The page is vanilla TypeScript. Most frameworks' dev servers are Vite's (SvelteKit, Nuxt, Astro, React Router, SolidStart), so these settings carry over. Next.js runs its own server and needs its own check (`allowedDevOrigins`).
- Processes on the host. The ingress routes to containers, so a dev server run directly on the host, outside Docker, isn't reachable yet.

## Testing

- Unit tests check the config's settings, the plugin that writes the names into the page, and the page itself in [happy-dom](https://github.com/capricorn86/happy-dom).
- An integration test starts a real Vite dev server from the config and requests it the way the ingress does, with a worktree's `Host`. It checks that the page has both names, the entry compiles, the hot reload client uses the page's own port, and a tunnel's host is accepted while any other host is refused.
- The path through Caddy itself was checked by hand in Chrome, Safari and Firefox, since CI has no ingress.

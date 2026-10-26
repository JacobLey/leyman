# local-ingress

`https://<worktree>.<repo>.localhost` into any devcontainer: one HTTPS reverse proxy per machine, shared by every repo, routing by host name to containers that ask for it with Docker labels.

- **Production-like URLs, over HTTPS.** Each worktree gets its own origin (cookies, storage and OAuth redirect URIs don't collide), with a certificate a browser trusts.
- **Nothing to install on the host** beyond Docker. Browsers resolve `*.localhost` to loopback themselves ([RFC 6761](https://www.rfc-editor.org/rfc/rfc6761#section-6.3)), so there's no DNS or `/etc/hosts` to edit. Not tied to OrbStack or Docker Desktop.
- **Trust once.** Certificates come from a certificate authority (CA) created on this machine and kept in a Docker volume. Its root is trusted once; leaf certificates are issued per host and renewed automatically.
- **Off the shelf.** [Caddy](https://caddyserver.com/) through [caddy-docker-proxy](https://github.com/lucaslorentz/caddy-docker-proxy), whose label format is used as-is.
- **Local only.** It listens on `127.0.0.1` and `::1`, never on other interfaces.

Private, not a package: a Docker image and compose project, started by [`ensure`](ensure).

## Contents
- [Starting it](#starting-it)
- [Trusting the CA](#trusting-the-ca)
- [Joining from a container](#joining-from-a-container)
- [How it routes](#how-it-routes)
- [Ports taken](#ports-taken)
- [Upgrading](#upgrading)
- [Removing it](#removing-it)
- [Compared to alternatives](#compared-to-alternatives)

## Starting it

```sh
tools/local-ingress/ensure          # start it if it isn't running; upgrade it if this checkout's version is newer
tools/local-ingress/ensure status   # the running version, and the checkout that started it
tools/local-ingress/ensure --force  # rebuild and replace it at this checkout's version
```

`ensure` is POSIX `sh` and needs only `docker` with Compose. It runs on the host or in a container using the host's Docker. Whichever checkout starts it first runs it, for every repo. Running `ensure` again does nothing, unless this checkout has a newer version. Its container is `local-ingress`, and it restarts with Docker (`restart: unless-stopped`).

## Trusting the CA

Open [http://ingress.localhost](http://ingress.localhost). It is the one host served over plain HTTP, so it loads before anything is trusted. It has the root certificate to download and the steps for each OS and browser. In short:

```sh
curl -fsSo local-ingress-root.crt http://ingress.localhost/root.crt

# macOS
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain local-ingress-root.crt
# Debian, Ubuntu (Chrome on Linux keeps its own store: import it under Settings → Manage certificates → Authorities)
sudo cp local-ingress-root.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates
# Windows, as administrator
certutil -addstore -f ROOT local-ingress-root.crt
```

Firefox uses its own store: import the certificate under Settings → Certificates → Authorities, or set `security.enterprise_roots.enabled` to `true` in `about:config` to trust the system's.

Trust is per machine, once. The root lasts 10 years and survives every upgrade. Only [removing it](#removing-it) with its volume creates a new one.

## Joining from a container

Attach the container to the `local-ingress` network and label it with [caddy-docker-proxy's labels](https://github.com/lucaslorentz/caddy-docker-proxy#labels-to-caddyfile-conversion). In compose:

```yaml
services:
  app:
    networks:
      - default
      - local-ingress
    labels:
      caddy: ${WORKTREE_NAME}.${REPO_NAME}.localhost
      # The container's own address on the network, so same-named services in other projects never collide
      caddy.reverse_proxy: '{{upstreams 5173}}'
      caddy.tls: internal

networks:
  local-ingress:
    external: true
```

- Only the container serving the app joins. Its sidecars stay off the network, so names like `postgres` keep resolving to the project's own copies.
- The network is external: `ensure` creates it, so run `ensure` (or `docker network create local-ingress`) before `docker compose up`.
- `caddy` may list several hosts, separated by spaces, e.g. a tunnel's host as well.
- Name hosts `<worktree>.<repo>.localhost`, and further services `<service>.<worktree>.<repo>.localhost`. Each DNS label is at most 63 characters.
- Cookies stay host-only: never set `Domain=.<repo>.localhost`, or worktrees share them.

Labels are read when a container starts, with no ingress restart. A container that stops drops out of the routes.

## How it routes

| Request | Answer |
|---|---|
| `https://<host>` labelled by a running container | Proxied to the container, with `X-Forwarded-Host` and `X-Forwarded-Proto` |
| `https://<host>.localhost` nothing serves | The help page, with a 404 saying nothing serves it |
| `http://ingress.localhost`, `https://ingress.localhost` | The help page and `/root.crt` |
| Any other `http://` | A temporary redirect (302) to `https://`. There's no HSTS, which browsers would remember |
| A host outside `.localhost` | Refused: no certificate is issued for it |

The configuration is [`Caddyfile`](Caddyfile), merged with the sites generated from labels. A certificate for a host nothing serves is issued on demand, only for `*.localhost` names.

## Ports taken

It needs ports 443 and 80 on loopback. If something else holds them, `ensure` says so. Choose others when running `ensure`:

```sh
LOCAL_INGRESS_HTTPS_PORT=8443 LOCAL_INGRESS_HTTP_PORT=8080 tools/local-ingress/ensure
```

URLs then carry the port (`https://main.leyman.localhost:8443`), and redirects keep it. Set both variables in your shell profile, so that `ensure` keeps the ports when a devcontainer runs it.

## Upgrading

One ingress serves every worktree, on whatever branch, so its configuration is versioned:

- **The image is the whole configuration.** The `Caddyfile` and help page are copied into `local-ingress:<VERSION>`, built from this folder, and nothing is mounted from a checkout. Deleting a worktree never breaks the running ingress.
- **`ensure` only moves forward.** A checkout with a newer [`VERSION`](VERSION) replaces the container. One with the same version does nothing, and one with an older version leaves it running, so worktrees on old branches don't downgrade it.
- **The CA is kept.** It lives in the `local-ingress-data` volume, which upgrades never touch.
- **Changes are additive.** A newer ingress keeps serving older worktrees' labels and network. A breaking change (network name, label format, ports) gets its own version and migration notes here.

When changing anything in the image or the compose file (base image digest included), bump `VERSION`, then run `tools/local-ingress/check-version --record`. The Nx target `check-version` fails if they changed without a bump. The help page footer shows the running version.

To force this checkout's version, even an older one: `ensure --force`.

## Removing it

```sh
docker compose -p local-ingress down --volumes --rmi all
docker network rm local-ingress
```

`--volumes` deletes the CA. Untrust its root afterwards ("Local Ingress Root" in your trust store). A new ingress creates a new root, which needs trusting again.

## Compared to alternatives

- [nginx-proxy](https://github.com/nginx-proxy/nginx-proxy): routes by a `VIRTUAL_HOST` variable, but certificates need mkcert or a companion container.
- [Traefik](https://traefik.io/): label routing, but no internal CA.
- OrbStack domains (`*.orb.local`): OrbStack only.
- [localias](https://github.com/peterldowns/localias), [puma-dev](https://github.com/puma/puma-dev): installed on the host.
- [mkcert](https://github.com/FiloSottile/mkcert): certificates only, made by hand, with no routing.

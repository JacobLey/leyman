import type { HtmlTagDescriptor, Plugin, ServerOptions, UserConfig } from 'vite';

/**
 * What the dev server needs to know about where it runs.
 */
export interface IngressOptions {
    /**
     * This worktree's name, the first label of its URL (`WORKTREE_NAME`).
     */
    readonly worktree?: string | undefined;
    /**
     * The repo's name, the second label of its URL (`REPO_NAME`).
     */
    readonly repo?: string | undefined;
    /**
     * A tunnel's public host name, also routed to this worktree (`TUNNEL_HOST`).
     */
    readonly tunnelHost?: string | undefined;
}

/**
 * The port `.devcontainer/docker-compose.yml` labels for the ingress. Each worktree has its own container,
 * so it never clashes with another worktree's.
 */
export const ingressPort = 5173;

/**
 * Reads the options from the environment a devcontainer provides: `initialize.sh` writes the names, and
 * `TUNNEL_HOST` is optional. Empty values count as unset.
 *
 * @param env - where to read `WORKTREE_NAME`, `REPO_NAME` and `TUNNEL_HOST`, `process.env` by default
 * @returns the names and tunnel host, each `undefined` when unset
 */
export const ingressOptionsFromEnv = (
    // eslint-disable-next-line n/no-process-env -- The devcontainer passes the names as environment variables
    env: Readonly<Record<string, string | undefined>> = process.env
): IngressOptions => {
    const read = (name: string): string | undefined => (env[name] === '' ? undefined : env[name]);
    return {
        worktree: read('WORKTREE_NAME'),
        repo: read('REPO_NAME'),
        tunnelHost: read('TUNNEL_HOST'),
    };
};

/**
 * The dev server settings for serving through tools/local-ingress.
 *
 * - Listens on every interface: the ingress reaches the container at its address on the `local-ingress` network,
 *   not on loopback.
 * - Fails rather than moving to another port, which the ingress wouldn't know about.
 * - Vite already accepts `*.localhost` hosts, so `allowedHosts` only adds a tunnel's.
 *
 * Nothing is set for the hot reload WebSocket: Vite's client connects to the page's own host and port, which are
 * the ingress's.
 *
 * @param options - the tunnel host, if any
 * @returns Vite's `server` options
 */
export const ingressServerOptions = (options: IngressOptions): ServerOptions => ({
    host: '0.0.0.0',
    port: ingressPort,
    strictPort: true,
    allowedHosts: options.tunnelHost === undefined ? [] : [options.tunnelHost],
});

/**
 * Writes the worktree's and repo's names into the page, as `<meta name="worktree">` and `<meta name="repo">`.
 *
 * @param options - the names; a missing one is left out
 * @returns a Vite plugin
 */
export const worktreeNamesPlugin = (options: IngressOptions): Plugin => ({
    name: 'worktree-names',
    transformIndexHtml: (): HtmlTagDescriptor[] =>
        (
            [
                ['worktree', options.worktree],
                ['repo', options.repo],
            ] satisfies [string, string | undefined][]
        )
            .filter((entry): entry is [string, string] => entry[1] !== undefined)
            .map(([name, content]) => ({
                tag: 'meta',
                attrs: { name, content },
                injectTo: 'head',
            })),
});

/**
 * The demo's whole Vite config.
 *
 * @param options - the names and tunnel host, from the environment by default
 * @returns a Vite config
 */
export const createViteConfig = (
    options: IngressOptions = ingressOptionsFromEnv()
): UserConfig => ({
    server: ingressServerOptions(options),
    plugins: [worktreeNamesPlugin(options)],
});

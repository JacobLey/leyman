const defaultPorts: Readonly<Record<string, string>> = { 'http:': '80', 'https:': '443' };

/**
 * A host, optionally with a port: `example.com`, `*.example.com`, `127.0.0.1:8080`, `[::1]:8080`.
 */
const hostPattern = /^(?<hostname>\[[\da-f:.]+\]|[^\s/:?#@[\]]+)(?::(?<port>\d+))?$/iu;

/**
 * Whether a URL may be fetched.
 */
export type HostFilter = (url: URL) => boolean;

/**
 * A filter of URLs by host.
 *
 * An entry matches a host exactly, on any port, unless it names one. An entry starting with `*.`
 * matches subdomains of the rest, but not the rest itself: `*.example.com` matches `api.example.com`,
 * but not `example.com`.
 *
 * @param entries - allowed hosts
 * @returns filter of URLs
 * @throws {TypeError} if an entry is not a host
 */
const allowHosts = (entries: readonly string[]): HostFilter => {
    const allowed = entries.map(entry => {
        const { hostname: host = '', port } = hostPattern.exec(entry)?.groups ?? {};
        if (!URL.canParse(`http://${host}`)) {
            throw new TypeError(`Not a host: "${entry}"`);
        }
        // Written as a URL writes it, e.g. lowercase, and punycode
        const { hostname } = new URL(`http://${host}`);
        const isWildcard = hostname.startsWith('*.');
        return {
            isWildcard,
            hostname: isWildcard ? hostname.slice(1) : hostname,
            port: port === undefined ? null : String(Number(port)),
        };
    });
    return url => {
        const port = url.port === '' ? defaultPorts[url.protocol] : url.port;
        return allowed.some(
            entry =>
                (entry.port === null || entry.port === port) &&
                (entry.isWildcard
                    ? url.hostname.endsWith(entry.hostname)
                    : url.hostname === entry.hostname)
        );
    };
};

/**
 * Which URLs may be fetched.
 *
 * @param fetch - whether to fetch, or which hosts to fetch from. See {@link allowHosts}
 * @returns filter of URLs, or null if none may be fetched
 * @throws {TypeError} if an entry is not a host
 */
export const hostFilter = (fetch: boolean | readonly string[]): HostFilter | null => {
    if (fetch === true) {
        return () => true;
    }
    return fetch === false ? null : allowHosts(fetch);
};

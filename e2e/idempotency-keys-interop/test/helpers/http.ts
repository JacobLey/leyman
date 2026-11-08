import { connect } from 'node:net';

export interface InteropRequest {
    /**
     * The request target, sent as its UTF-8 bytes, exactly: never normalized as `fetch` would (`new URL()` resolves
     * `/a/../notes` before sending), nor refused as `node:http` refuses a raw non-ASCII path.
     */
    readonly target?: string;
    readonly method?: string;
    readonly scope: string;
    readonly key?: string;
    readonly body?: string;
    /**
     * How long the handler sleeps, in milliseconds.
     */
    readonly delayMs?: number;
    /**
     * The status the handler answers with: 201 by default.
     */
    readonly status?: number;
}

export interface InteropResponse {
    readonly status: number;
    /**
     * Header names in lower case.
     */
    readonly headers: ReadonlyMap<string, string>;
    readonly body: string;
}

/**
 * Sends one HTTP/1.1 request over a socket of its own, and reads the response until the server closes it.
 *
 * @param port - Server's port on 127.0.0.1
 * @param request - What to send
 * @returns The response
 * @rejects {Error} When the server closes the connection without a whole response, as a killed server does
 */
export const send = async (
    port: number,
    { target = '/notes', method = 'POST', scope, key, body = '{}', delayMs, status }: InteropRequest
): Promise<InteropResponse> => {
    const headers: [string, string][] = [
        ['Host', `127.0.0.1:${port}`],
        ['Connection', 'close'],
        ['Content-Type', 'application/json'],
        ['Content-Length', String(Buffer.byteLength(body))],
        ['X-Scope', scope],
    ];
    if (key !== undefined) {
        headers.push(['Idempotency-Key', key]);
    }
    if (delayMs !== undefined) {
        headers.push(['X-Delay-Ms', String(delayMs)]);
    }
    if (status !== undefined) {
        headers.push(['X-Status', String(status)]);
    }
    const headLines = headers.map(([name, value]) => `${name}: ${value}\r\n`).join('');
    const head = `${method} ${target} HTTP/1.1\r\n${headLines}\r\n`;

    const raw = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const socket = connect(port, '127.0.0.1', () => {
            // Written, not ended: a half-closed socket makes Node's server close it without answering
            socket.write(Buffer.concat([Buffer.from(head, 'utf8'), Buffer.from(body, 'utf8')]));
        });
        socket.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
        });
        socket.on('end', () => {
            resolve(Buffer.concat(chunks));
        });
        socket.on('error', reject);
    });

    const split = raw.indexOf('\r\n\r\n');
    if (split === -1) {
        throw new Error(`Incomplete response: ${JSON.stringify(raw.toString('latin1'))}`);
    }
    const [statusLine = '', ...headerLines] = raw
        .subarray(0, split)
        .toString('latin1')
        .split('\r\n');
    const responseHeaders = new Map<string, string>();
    for (const line of headerLines) {
        const colon = line.indexOf(':');
        responseHeaders.set(line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim());
    }
    if (responseHeaders.has('transfer-encoding')) {
        throw new Error('Chunked responses are not expected: both servers buffer theirs');
    }
    return {
        status: Number(statusLine.split(' ', 2)[1]),
        headers: responseHeaders,
        body: raw.subarray(split + 4).toString('utf8'),
    };
};

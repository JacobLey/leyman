import type { Readable, Writable } from 'node:stream';

/**
 * A JSON-RPC 2.0 message: a request (with an `id`), a notification (without one), or a response.
 */
export interface Message {
    readonly jsonrpc: '2.0';
    readonly id?: number | string | null;
    readonly method?: string;
    readonly params?: unknown;
    readonly result?: unknown;
    readonly error?: { readonly code: number; readonly message: string };
}

const headerEnd = '\r\n\r\n';
const contentLength = /^content-length:\s*(?<length>\d+)\s*$/imv;

/**
 * Read the first message from the bytes read so far.
 *
 * @param buffer - bytes read, and not yet taken
 * @returns the message's body and the bytes after it; or, if only its header is all there, how many bytes the
 * whole message takes; or `null` if not even its header is
 * @throws {Error} if a header has no `Content-Length`
 */
const readFrame = (buffer: Buffer): { body: string; rest: Buffer } | { needed: number } | null => {
    const end = buffer.indexOf(headerEnd);
    if (end === -1) {
        return null;
    }
    const header = buffer.subarray(0, end).toString('ascii');
    const length = contentLength.exec(header)?.groups?.length;
    if (length === undefined) {
        throw new Error(`Content mapper message header has no Content-Length: ${header}`);
    }
    const start = end + headerEnd.length;
    const bodyEnd = start + Number(length);
    return buffer.length < bodyEnd
        ? { needed: bodyEnd }
        : {
              body: buffer.subarray(start, bodyEnd).toString('utf8'),
              rest: buffer.subarray(bodyEnd),
          };
};

/**
 * Read JSON-RPC messages framed as in the Language Server Protocol: a `Content-Length` header, a blank line,
 * then that many bytes of UTF-8 JSON. TypeScript speaks it to content mappers over their stdin and stdout.
 *
 * Chunks are kept apart until the message they belong to is all there, then joined once, so a large message
 * read in many chunks costs time in proportion to its size, not to its size times the number of chunks.
 *
 * @param input - stream to read
 * @yields {Message} each message, until the stream ends
 * @rejects {Error} if a header has no `Content-Length`
 */
export const readMessages = async function* (input: Readable): AsyncGenerator<Message> {
    let chunks: Buffer[] = [];
    let size = 0;
    // Bytes the next message takes, header included, once its header is read
    let needed: number | null = null;
    for await (const chunk of input) {
        chunks.push(chunk as Buffer);
        size += (chunk as Buffer).length;
        if (needed !== null && size < needed) {
            continue;
        }
        let buffer: Buffer = Buffer.concat(chunks, size);
        let frame = readFrame(buffer);
        while (frame && 'body' in frame) {
            buffer = frame.rest;
            yield JSON.parse(frame.body) as Message;
            frame = readFrame(buffer);
        }
        chunks = [buffer];
        size = buffer.length;
        needed = frame?.needed ?? null;
    }
};

/**
 * Write a JSON-RPC message, framed as {@link readMessages} reads it.
 *
 * @param output - stream to write
 * @param message - message to write
 */
export const writeMessage = (output: Writable, message: Message): void => {
    const body = Buffer.from(JSON.stringify(message), 'utf8');
    output.write(`Content-Length: ${body.length}${headerEnd}`);
    output.write(body);
};

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
 * Take the first whole message from the bytes read so far.
 *
 * @param buffer - bytes read, and not yet taken
 * @returns the message's body and the bytes after it, or `null` if the message isn't all there yet
 * @throws {Error} if a header has no `Content-Length`
 */
const takeMessage = (buffer: Buffer): { body: string; rest: Buffer } | null => {
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
        ? null
        : {
              body: buffer.subarray(start, bodyEnd).toString('utf8'),
              rest: buffer.subarray(bodyEnd),
          };
};

/**
 * Read JSON-RPC messages framed as in the Language Server Protocol: a `Content-Length` header, a blank line,
 * then that many bytes of UTF-8 JSON. TypeScript speaks it to content mappers over their stdin and stdout.
 *
 * @param input - stream to read
 * @yields {Message} each message, until the stream ends
 * @rejects {Error} if a header has no `Content-Length`
 */
export const readMessages = async function* (input: Readable): AsyncGenerator<Message> {
    let buffer: Buffer = Buffer.alloc(0);
    for await (const chunk of input) {
        buffer = Buffer.concat([buffer, chunk as Buffer]);
        let taken = takeMessage(buffer);
        while (taken) {
            buffer = taken.rest;
            yield JSON.parse(taken.body) as Message;
            taken = takeMessage(buffer);
        }
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

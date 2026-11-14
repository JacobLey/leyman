import { PassThrough, Readable } from 'node:stream';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { readMessages, writeMessage } from '#internal/lib/protocol.js';

/**
 * Collect every message read from the given chunks.
 *
 * @param chunks - raw chunks, read one at a time
 * @returns messages read
 */
const read = async (chunks: readonly (string | Buffer)[]): Promise<unknown[]> =>
    Array.fromAsync(readMessages(Readable.from(chunks.map(chunk => Buffer.from(chunk)))));

suite('protocol', () => {
    test('round trip', async () => {
        const stream = new PassThrough();
        writeMessage(stream, { jsonrpc: '2.0', id: 1, result: { text: 'é 💥' } });
        writeMessage(stream, { jsonrpc: '2.0', method: 'note' });
        stream.end();

        const messages: unknown[] = await Array.fromAsync(readMessages(stream));
        expect(messages).to.deep.equal([
            { jsonrpc: '2.0', id: 1, result: { text: 'é 💥' } },
            { jsonrpc: '2.0', method: 'note' },
        ]);
    });

    test('a message split across chunks, with a multi-byte character split too', async () => {
        const body = Buffer.from('{"jsonrpc":"2.0","id":2,"result":"💥"}', 'utf8');
        const framed = Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]);
        const split = framed.length - 4;

        expect(
            await read([framed.subarray(0, 10), framed.subarray(10, split), framed.subarray(split)])
        ).to.deep.equal([{ jsonrpc: '2.0', id: 2, result: '💥' }]);
    });

    test('a large message in many chunks is joined once', async () => {
        const body = Buffer.from(
            JSON.stringify({ jsonrpc: '2.0', id: 3, result: 'a'.repeat(2 ** 20) }),
            'utf8'
        );
        const framed = Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]);
        const chunkSize = 2 ** 10;
        const chunks: Buffer[] = [];
        for (let start = 0; start < framed.length; start += chunkSize) {
            chunks.push(framed.subarray(start, start + chunkSize));
        }

        // Joining the bytes read so far on every chunk would copy about chunks / 2 times the message
        let copied = 0;
        const concat = Buffer.concat.bind(Buffer);
        Buffer.concat = (list, totalLength) => {
            const joined = concat(list, totalLength);
            copied += joined.length;
            return joined;
        };
        let messages: unknown[];
        try {
            messages = await read(chunks);
        } finally {
            // eslint-disable-next-line require-atomic-updates -- restores the original, which nothing else replaces
            Buffer.concat = concat;
        }

        expect(messages).to.deep.equal([{ jsonrpc: '2.0', id: 3, result: 'a'.repeat(2 ** 20) }]);
        expect(copied).to.be.lessThan(2 * framed.length);
    });

    test('other headers', async () => {
        expect(
            await read([
                'Content-Type: application/vscode-jsonrpc; charset=utf-8\r\ncontent-length: 17\r\n\r\n{"jsonrpc":"2.0"}',
            ])
        ).to.deep.equal([{ jsonrpc: '2.0' }]);
    });

    test('a header without Content-Length', async () => {
        await expect(read(['Content-Type: x\r\n\r\n{}'])).to.be.rejectedWith(
            Error,
            'Content mapper message header has no Content-Length: Content-Type: x'
        );
    });
});

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

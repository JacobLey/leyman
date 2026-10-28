import type { Message } from '#internal/lib/protocol.js';
import { PassThrough } from 'node:stream';
import { expect } from '@leyman/expect';
import { genever, parseYaml } from 'genever';
import { diagnosticCodes, diagnosticSource, serve } from 'genever-content-mapper';
import { suite, test } from 'mocha-chain';
import { readMessages, writeMessage } from '#internal/lib/protocol.js';

/**
 * Send messages to the mapper, and collect its responses.
 *
 * @param messages - requests and notifications, in order
 * @returns responses, in order
 */
const exchange = async (messages: readonly Omit<Message, 'jsonrpc'>[]): Promise<Message[]> => {
    const input = new PassThrough();
    const output = new PassThrough();
    const served = serve(input, output);
    for (const message of messages) {
        writeMessage(input, { jsonrpc: '2.0', ...message });
    }
    input.end();
    await served;
    output.end();
    const responses: Message[] = await Array.fromAsync(readMessages(output));
    return responses;
};

const schema = 'type: array\nitems: { type: string }\n';

suite('serve', () => {
    test('initialize', async () => {
        expect(
            await exchange([
                { id: 1, method: 'initialize', params: { positionEncodings: ['utf-16'] } },
            ])
        ).to.deep.equal([
            {
                jsonrpc: '2.0',
                id: 1,
                result: { positionEncoding: 'utf-16', diagnosticSource },
            },
        ]);
    });

    test("transforms with each project's options, until it's closed", async () => {
        const transform = (id: number, projectHandle: string): Omit<Message, 'jsonrpc'> => ({
            id,
            method: 'transform',
            params: { fileName: '/project/tags.schema.yaml', content: schema, projectHandle },
        });

        expect(
            await exchange([
                {
                    id: 1,
                    method: 'openProject',
                    params: { projectHandle: 'a', options: { name: 'Tags' } },
                },
                { id: 2, method: 'openProject', params: { projectHandle: 'b' } },
                transform(3, 'a'),
                transform(4, 'b'),
                { id: 5, method: 'closeProject', params: { projectHandle: 'a' } },
                transform(6, 'a'),
            ])
        ).to.deep.equal([
            { jsonrpc: '2.0', id: 1, result: { optionDiagnostics: [] } },
            { jsonrpc: '2.0', id: 2, result: { optionDiagnostics: [] } },
            {
                jsonrpc: '2.0',
                id: 3,
                result: {
                    text: genever(parseYaml(schema), { name: 'Tags' }),
                    extension: '.ts',
                    mappings: [],
                    diagnostics: [],
                },
            },
            {
                jsonrpc: '2.0',
                id: 4,
                result: {
                    text: genever(parseYaml(schema)),
                    extension: '.ts',
                    mappings: [],
                    diagnostics: [],
                },
            },
            { jsonrpc: '2.0', id: 5, result: null },
            {
                jsonrpc: '2.0',
                id: 6,
                result: {
                    text: genever(parseYaml(schema)),
                    extension: '.ts',
                    mappings: [],
                    diagnostics: [],
                },
            },
        ]);
    });

    test('invalid options', async () => {
        expect(
            await exchange([
                {
                    id: 1,
                    method: 'openProject',
                    params: { projectHandle: 'a', options: { strict: 'no' } },
                },
            ])
        ).to.deep.equal([
            {
                jsonrpc: '2.0',
                id: 1,
                result: {
                    optionDiagnostics: [
                        {
                            path: ['strict'],
                            messageText: "Option 'strict' must be a boolean.",
                            code: 1,
                        },
                    ],
                },
            },
        ]);
    });

    test('diagnostics in the document', async () => {
        const [response] = await exchange([
            {
                id: 1,
                method: 'transform',
                params: { fileName: '/project/a.yaml', content: 'a: [\n', projectHandle: 'a' },
            },
        ]);

        expect(response).to.have.nested.property('result.text', 'export {};\n');
        expect(response)
            .to.have.nested.property('result.diagnostics[0].code')
            .that.equals(diagnosticCodes.syntax);
    });

    test('an unknown method, and notifications', async () => {
        expect(
            await exchange([
                { method: 'initialized' },
                { id: 'x', result: null },
                { id: 1, method: 'shutdown' },
                { id: 2, method: 'toString' },
                { id: 3, method: 'closeProject' },
            ])
        ).to.deep.equal([
            {
                jsonrpc: '2.0',
                id: 1,
                error: { code: -32_601, message: 'Unknown method: shutdown' },
            },
            {
                jsonrpc: '2.0',
                id: 2,
                error: { code: -32_601, message: 'Unknown method: toString' },
            },
            { jsonrpc: '2.0', id: 3, result: null },
        ]);
    });
});

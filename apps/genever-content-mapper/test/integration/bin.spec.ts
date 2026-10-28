import { spawn } from 'node:child_process';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { readMessages, writeMessage } from '#internal/lib/protocol.js';

suite('bin', () => {
    test('serves on stdin and stdout, and exits once stdin ends', async () => {
        const child = spawn(process.execPath, ['bin.mjs'], { stdio: ['pipe', 'pipe', 'inherit'] });
        const exited = new Promise<number | null>(resolve => {
            child.on('exit', resolve);
        });

        writeMessage(child.stdin, {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: { positionEncodings: ['utf-16'] },
        });
        child.stdin.end();

        expect(await Array.fromAsync(readMessages(child.stdout))).to.deep.equal([
            {
                jsonrpc: '2.0',
                id: 1,
                result: { positionEncoding: 'utf-16', diagnosticSource: 'genever' },
            },
        ]);
        expect(await exited).to.equal(0);
    });
});

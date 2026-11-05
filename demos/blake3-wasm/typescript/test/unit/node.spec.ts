import { blake3 } from '@noble/hashes/blake3.js';
import { createHashWorker, hash } from '@leyman/demo-blake3-wasm';
import testVectors from '@leyman/demo-blake3-wasm-rust/test-vectors.json' with { type: 'json' };
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';

const { cases, inputByteCycle } = testVectors;

const input = (length: number): Uint8Array<ArrayBuffer> =>
    Uint8Array.from({ length }, (_, i) => i % inputByteCycle);
const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

suite('On Node.js', () => {
    test('Returns every test vector', () => {
        expect(cases).to.have.length.greaterThan(0);
        for (const { inputLength, hash: expected } of cases) {
            expect(hex(hash(input(inputLength))), `${inputLength} bytes`).to.equal(expected);
        }
    });

    test('Agrees with @noble/hashes past where SIMD starts', () => {
        for (const length of [3072, 4095, 4096, 4097, 16_385, 1_048_577]) {
            expect(hex(hash(input(length))), `${length} bytes`).to.equal(
                hex(blake3(input(length)))
            );
        }
    });

    suite('In a worker', () => {
        test('Returns every test vector', async () => {
            await using worker = createHashWorker();
            for (const { inputLength, hash: expected } of cases) {
                expect(hex(await worker.hash(input(inputLength))), `${inputLength} bytes`).to.equal(
                    expected
                );
            }
        });

        test('Copies by default', async () => {
            await using worker = createHashWorker();
            const bytes = input(1024);
            const hashed = await worker.hash(bytes);
            expect(bytes.length).to.equal(1024);
            expect(hex(hashed)).to.equal(hex(hash(bytes)));
        });

        test('Transfer moves the bytes', async () => {
            await using worker = createHashWorker();
            const bytes = input(1024);
            const expected = hex(hash(bytes));
            expect(hex(await worker.hash(bytes, { transfer: true }))).to.equal(expected);
            expect(bytes.length).to.equal(0);
        });

        test('Leaves the event loop free', async () => {
            await using worker = createHashWorker();
            let turns = 0;
            const interval = setInterval(() => {
                turns++;
            }, 0);
            await worker.hash(new Uint8Array(64 * 1024 * 1024), { transfer: true });
            clearInterval(interval);
            expect(turns).to.be.greaterThan(1);
        });

        test('Close stops it, and can be repeated', async () => {
            const worker = createHashWorker();
            await worker.close();
            await worker.close();
        });
    });
});

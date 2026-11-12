import testVectors from '@leyman/demo-blake3-wasm-rust/test-vectors.json' with { type: 'json' };
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { tightBlake3 } from '#test/bench/tight-blake3.js';

// The bench's baseline: a wrong baseline would make every comparison in the README wrong
suite('The bench’s tight JavaScript', () => {
    test('Returns every test vector', () => {
        for (const { inputLength, hash } of testVectors.cases) {
            const input = Uint8Array.from(
                { length: inputLength },
                (_, i) => i % testVectors.inputByteCycle
            );
            const actual = tightBlake3(input).toHex();
            expect(actual, `${inputLength} bytes`).to.equal(hash);
        }
    });
});

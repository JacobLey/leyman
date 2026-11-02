import testVectors from '@leyman/demo-blake3-wasm-rust/test-vectors.json' with { type: 'json' };
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { tightBlake3 } from '../bench/tight-blake3.js';

// The bench's baseline: a wrong baseline would make every comparison in the README wrong
suite('The bench’s tight JavaScript', () => {
    test('Returns every test vector', () => {
        for (const { inputLength, hash } of testVectors.cases) {
            const input = Uint8Array.from(
                { length: inputLength },
                (_, i) => i % testVectors.inputByteCycle
            );
            // eslint-disable-next-line unicorn/prefer-uint8array-hex -- Not on Node.js 24
            const actual = Buffer.from(tightBlake3(input)).toString('hex');
            expect(actual, `${inputLength} bytes`).to.equal(hash);
        }
    });
});

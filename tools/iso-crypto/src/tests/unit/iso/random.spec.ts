import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { before, suite, test } from 'mocha-hookup';
import * as IsoCrypto from 'iso-crypto';
import type * as Random from '#random';
import * as BrowserRandom from '../../../iso/random/browser.js';
import * as NodeRandom from '../../../iso/random/node.js';

// coverage
import '../../../iso/random/types.js';

suite('Random', () => {
    test('types', () => {
        expectTypeOf<typeof Random>().toEqualTypeOf(BrowserRandom);
        expectTypeOf<typeof Random>().toEqualTypeOf(NodeRandom);
        expectTypeOf(IsoCrypto).toMatchTypeOf(NodeRandom);
    });

    suite('randomBytes', () => {
        const randomTest = async ({
            random,
        }: { random: typeof NodeRandom }) => {
            for (const size of [0, 1, 10, 32, 100, 1234]) {
                const bytes = await random.randomBytes(size);
                expect(bytes.length).to.equal(size);
                expect(bytes).to.be.an.instanceOf(Uint8Array);
            }
        };

        suite('browser', () => {
            before(() => ({
                random: BrowserRandom,
            })).test('success', randomTest);
        });

        suite('node', () => {
            before(() => ({
                random: NodeRandom,
            })).test('success', randomTest);
        });
    });
});

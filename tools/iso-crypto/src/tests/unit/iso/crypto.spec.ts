import { expect } from 'chai';
import { afterEach, suite, test } from 'mocha-hookup';
import { define, verifyAndRestore } from 'sinon';
import crypto from '#crypto';

suite('Crypto', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    suite('browser', () => {
        test('Loads from global', async () => {
            define(global, 'webcrypto', crypto);

            const browserCrypto = await import(
                '../../../iso/crypto/browser.js'
            );
            expect(browserCrypto.default).to.equal(crypto);
        });
    });
});

import { expect } from 'chai';
import { afterEach, suite, test } from 'mocha-hookup';
import { define, verifyAndRestore } from 'sinon';
import { atob, btoa } from '#base64';

suite('Base64', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    suite('browser', () => {
        test('Loads from window', async () => {
            define(global, 'window', {
                atob,
                btoa,
            });

            const browserBase64 = await import(
                '../../../iso/base64/browser.js'
            );
            expect(browserBase64.atob).to.equal(atob);
            expect(browserBase64.btoa).to.equal(btoa);
        });
    });
});

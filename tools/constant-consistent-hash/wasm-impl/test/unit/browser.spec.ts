import { expect } from '@leyman/expect';
import { before, suite } from 'mocha-chain';

// `e2e/constant-consistent-hash-wasm-browser` runs this entry point in browsers. Node.js can't fetch the `.wasm` file,
// so initialize the shared bindings through the Node.js entry point first
suite('Browser entry point', () => {
    const withBrowser = before(async () => {
        await import('@leyman/constant-consistent-hash-wasm');
        return { browser: await import('#internal/browser.js') };
    });

    withBrowser.test('Exports the same functions', ({ browser }) => {
        expect(browser.consistentHash('00000000-0000-4000-8000-000000000000', 7)).to.equal(2);
        expect(browser.hashKey('00000000-0000-4000-8000-000000000000')).to.deep.equal([
            865_118_427, 3_574_204_183,
        ]);
    });
});

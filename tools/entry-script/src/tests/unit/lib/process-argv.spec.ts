import { suite, test } from 'mocha-chain';
import { getProcessArgvBinIndex } from '#process-argv';
import { expect } from '../../chai-hooks.js';

suite('process.argv', () => {
    test('Is normal Node', () => {
        expect(getProcessArgvBinIndex(process)).to.equal(1);
    });

    test('Is unbundled Electron', () => {
        expect(
            getProcessArgvBinIndex({
                versions: {
                    electron: '1.2.3',
                },
                defaultApp: true,
            })
        ).to.equal(1);
    });

    test('Is bundled electron', () => {
        expect(
            getProcessArgvBinIndex({
                versions: {
                    electron: '1.2.3',
                },
            })
        ).to.equal(0);
    });
});

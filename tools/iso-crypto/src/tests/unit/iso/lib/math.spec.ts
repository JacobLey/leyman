import { expect } from 'chai';
import { suite, test } from 'mocha-hookup';
import { deriveYCoordinate } from '../../../../iso/lib/math.js';

suite('Math', () => {

    test('deriveYCoordinate', () => {

        expect(
            deriveYCoordinate(1n, false, {
                // Not a "real" curve, just getting test coverage
                a: 1n,
                b: 3n,
                p: 41n,
                g: {
                    x: 8n,
                    y: 24n,
                },
            })
        ).to.equal(28n);
    });
});

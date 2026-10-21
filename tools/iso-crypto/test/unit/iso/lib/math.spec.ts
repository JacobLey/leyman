import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { deriveYCoordinate } from '#internal/iso/lib/math.js';

// Not a "real" curve, but its prime is 3 mod 4 like the real ones
const curve = {
    a: 1n,
    b: 3n,
    p: 43n,
    g: {
        x: 2n,
        y: 20n,
    },
};

suite('Math', () => {
    test('deriveYCoordinate', () => {
        expect(deriveYCoordinate(2n, false, curve)).to.equal(20n);
        expect(deriveYCoordinate(2n, true, curve)).to.equal(23n);
    });

    test('deriveYCoordinate rejects an x with no point', () => {
        // 1 + 1 + 3 = 5 has no square root mod 43
        expect(() => deriveYCoordinate(1n, false, curve)).to.throw(
            'Public key is not a point on the curve'
        );
        expect(() => deriveYCoordinate(43n, false, curve)).to.throw(
            'Public key is not a point on the curve'
        );
    });
});

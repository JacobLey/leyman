import { createECDH } from 'node:crypto';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { curves, derivePublicKey, deriveYCoordinate } from '#internal/iso/lib/math.js';

const opensslCurves = { p256: 'prime256v1', p384: 'secp384r1', p521: 'secp521r1' } as const;

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

    suite('derivePublicKey matches OpenSSL', () => {
        for (const [name, opensslName] of Object.entries(opensslCurves)) {
            test(name, () => {
                const generated = Array.from({ length: 20 }, () => {
                    const ecdh = createECDH(opensslName);
                    ecdh.generateKeys();
                    return ecdh.getPrivateKey();
                });
                const bytes = generated[0]!.byteLength;
                // The smallest keys exercise the ladder's first steps
                const small = [1, 2, 3].map(key =>
                    Buffer.from(key.toString(16).padStart(bytes * 2, '0'), 'hex')
                );
                for (const privateKey of [...small, ...generated]) {
                    const ecdh = createECDH(opensslName);
                    ecdh.setPrivateKey(privateKey);
                    const publicKey = ecdh.getPublicKey();
                    const half = (publicKey.byteLength - 1) / 2;
                    const toBigInt = (buffer: Buffer): bigint =>
                        BigInt(`0x${buffer.toString('hex')}`);

                    expect(
                        derivePublicKey(
                            toBigInt(privateKey),
                            curves[name as keyof typeof opensslCurves]
                        )
                    ).to.deep.equal({
                        x: toBigInt(publicKey.subarray(1, 1 + half)),
                        y: toBigInt(publicKey.subarray(1 + half)),
                    });
                }
            });
        }
    });
});

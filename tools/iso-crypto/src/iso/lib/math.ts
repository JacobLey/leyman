// This module provides the basic ECC functionality of transforming a private key into a public key.

// _Ideally_ built-in modules implement most of the crypto logic for us. However in the case of
// browser-side JS, the SubtleCrypto module is incapable of importing private keys directly and
// internally computing the public key.

// Note: this is performed on key generation, and is also validated on private key + public key input 🙄.

// As such that step of calculation must be performed manually.
// All other ECC crypto math is performed by built in libraries and not handled here.

// Given the single use case of this library, combined with built-in validations, this module only
// implements the bare minimum logic. Validating inputs or handling special cases like Infinity are ignored.

export interface Point {
    readonly x: bigint;
    readonly y: bigint;
}

/**
 * Curve specification.
 *
 * Defines a curve using equation `y^2 ≡ (x^3 + a*x + b) % p`.
 *
 * Values like `n` and `b` are ignored as they are not required for this specific use cases.
 */
interface Curve {
    /**
     * Prime. `p` in equation.
     */
    readonly p: bigint;
    /**
     * `a` in equation.
     */
    readonly a: bigint;
    /**
     * `b` in equation
     */
    readonly b: bigint;
    /**
     * Base Point, lies on curve. Public Key given a Private Key of 1.
     */
    readonly g: Point;
}

/**
 * Curves as described by {@link https://www.secg.org/sec2-v2.pdf}
 */
export const curves = {
    p256: {
        p: 2n ** 224n * (2n ** 32n - 1n) + 2n ** 192n + 2n ** 96n - 1n,
        a: 0xffffffff_00000001_00000000_00000000_00000000_ffffffff_ffffffff_fffffffcn,
        b: 0x5ac635d8_aa3a93e7_b3ebbd55_769886bc_651d06b0_cc53b0f6_3bce3c3e_27d2604bn,
        g: {
            x: 0x6b17d1f2_e12c4247_f8bce6e5_63a440f2_77037d81_2deb33a0_f4a13945_d898c296n,
            y: 0x4fe342e2_fe1a7f9b_8ee7eb4a_7c0f9e16_2bce3357_6b315ece_cbb64068_37bf51f5n,
        },
    },
    p384: {
        p: 2n ** 384n - 2n ** 128n - 2n ** 96n + 2n ** 32n - 1n,
        a: 0xffffffff_ffffffff_ffffffff_ffffffff_ffffffff_ffffffff_ffffffff_fffffffe_ffffffff_00000000_00000000_fffffffcn,
        b: 0xb3312fa7_e23ee7e4_988e056b_e3f82d19_181d9c6e_fe814112_0314088f_5013875a_c656398d_8a2ed19d_2a85c8ed_d3ec2aefn,
        g: {
            x: 0xaa87ca22_be8b0537_8eb1c71e_f320ad74_6e1d3b62_8ba79b98_59f741e0_82542a38_5502f25d_bf55296c_3a545e38_72760ab7n,
            y: 0x3617de4a_96262c6f_5d9e98bf_9292dc29_f8f41dbd_289a147c_e9da3113_b5f0b8c0_0a60b1ce_1d7e819d_7a431d7c_90ea0e5fn,
        },
    },
    p521: {
        p: 2n ** 521n - 1n,
        a: 0x1ff_ffffffff_ffffffff_ffffffff_ffffffff_ffffffff_ffffffff_ffffffff_ffffffff_ffffffff_ffffffff_ffffffff_ffffffff_ffffffff_ffffffff_ffffffff_fffffffcn,
        b: 0x51_953eb961_8e1c9a1f_929a21a0_b68540ee_a2da725b_99b315f3_b8b48991_8ef109e1_56193951_ec7e937b_1652c0bd_3bb1bf07_3573df88_3d2c34f1_ef451fd4_6b503f00n,
        g: {
            x: 0xc6_858e06b7_0404e9cd_9e3ecb66_2395b442_9c648139_053fb521_f828af60_6b4d3dba_a14b5e77_efe75928_fe1dc127_a2ffa8de_3348b3c1_856a429b_f97e7e31_c2e5bd66n,
            y: 0x118_39296a78_9a3bc004_5c8a5fb4_2c7d1bd9_98f54449_579b4468_17afbd17_273e662c_97ee7299_5ef42640_c550b901_3fad0761_353c7086_a272c240_88be9476_9fd16650n,
        },
    },
};

/**
 * Linear Diophantine equations.
 *
 * @see {@link https://mathworld.wolfram.com/DiophantineEquation.html}
 *
 * ax + by = c.
 * Special case of c = 1.
 * Solve for base case of x0 and y0.
 *
 * [Validate Solutions]{@link https://planetcalc.com/3303/}
 *
 * @param a - constant a
 * @param b - constant b
 * @returns base solution
 */
const euclidian = (a: bigint, b: bigint): Point => {
    const pairs: { a: bigint; b: bigint }[] = [];
    let oldA = a;
    let oldB = b;
    let mod = a % b;
    while (mod > 1n) {
        pairs.push({ a: oldA, b: oldB });
        mod = oldB % oldA;
        oldB = oldA;
        oldA = mod;
    }

    let x = 1n;
    let y = 0n;
    let pair = pairs.pop();
    while (pair) {
        y = x;
        x = (1n - pair.b * y) / pair.a;
        pair = pairs.pop();
    }

    return { x, y };
};

/**
 * Calculate modular inverse.
 *
 * @see {@link https://en.wikipedia.org/wiki/Modular_multiplicative_inverse}
 *
 * {@link https://planetcalc.com/3311/ Validate Solutions}
 *
 * @param a - value
 * @param mod - modulus
 * @returns modular inverse of `a`
 */
const modularInverse = (a: bigint, mod: bigint): bigint => {
    const inverse = euclidian(a < 0n ? a + mod : a, mod).x;
    if (inverse < 0n) {
        return inverse + mod;
    }
    return inverse;
};

/**
 * Calculate positive modulus.
 *
 * @example
 * positiveMod(7n, 10n) === 7n;
 * positiveMod(-7n, 10n) === 3n;
 *
 * @param x - value
 * @param mod - modulus
 * @returns positive remainder
 */
const positiveMod = (x: bigint, mod: bigint): bigint => {
    const result = x % mod;
    if (result < 0n) {
        return result + mod;
    }
    return result;
};

/**
 * Add two points on the curve.
 *
 * @see {@link https://medium.com/asecuritysite-when-bob-met-alice/adding-points-in-elliptic-curve-cryptography-a1f0a1bce638}
 *
 * Note conditions like Infinity are ignored/improperly handled, but that is acceptable for expected use case.
 *
 * @param p - first point
 * @param q - second point
 * @param curve - curve specification
 * @returns result point
 */
const addPoints = (p: Point, q: Point, curve: Curve): Point => {
    const { rise, run } =
        p.x === q.x
            ? {
                  rise: 3n * p.x * p.x + curve.a,
                  run: 2n * p.y,
              }
            : {
                  rise: q.y - p.y,
                  run: q.x - p.x,
              };
    const slope = (rise * modularInverse(run, curve.p)) % curve.p;

    const x = positiveMod(slope * slope - q.x - p.x, curve.p);
    return {
        x,
        y: positiveMod(slope * p.x - slope * x - p.y, curve.p),
    };
};

/**
 * Derives coordinates of ECC public key given private key (random number) and curve.
 * Implements Double-and-add method.
 *
 * @see {@link https://en.wikipedia.org/wiki/Elliptic_curve_point_multiplication}
 *
 * @param privateKey - random number in curve range
 * @param curve - Curve specification
 * @returns public key point
 */
export const derivePublicKey = (privateKey: bigint, curve: Curve): Point => {
    const bits = [...privateKey.toString(2)].reverse();

    let doublePoint: Point | null = null;
    let sum: Point | null = null;

    for (const bit of bits) {
        doublePoint = doublePoint ? addPoints(doublePoint, doublePoint, curve) : curve.g;
        if (bit === '1') {
            sum = sum ? addPoints(sum, doublePoint, curve) : doublePoint;
        }
    }
    return sum!;
};

/**
 * Perform exponent math for BigInt.
 *
 * power(x, y, p) == (x ^ y) % p
 *
 * Exponents are supported natively, but in cases of _large_ exponents, it is not possible.
 * (Either very slow, or hits max BigInt).
 *
 * @param x - x in equation. "Base x"
 * @param y - y in equation. "Power y"
 * @param p - p in equation. Prime modulus.
 * @returns result of (x ^ y) % p
 */
const power = (x: bigint, y: bigint, p: bigint): bigint => {
    let res = 1n;
    let x2 = x;
    const bits = [...y.toString(2)].reverse();

    for (const bit of bits) {
        if (bit === '1') {
            res = (res * x2) % p;
        }
        x2 = (x2 * x2) % p;
    }
    return res;
};

/**
 * Tonelli–Shanks algorithm.
 *
 * @see {@link https://en.wikipedia.org/wiki/Tonelli%E2%80%93Shanks_algorithm}
 *
 * y^2 = n % p
 * Solves for y.
 *
 * Implementation translated from [python](https://github.com/fabiomainardi/Tonelli-Shanks/blob/master/tonelli_shanks.py).
 *
 * @param n - "quadratic residue" mod p
 * @param p - prime modulus
 * @returns y
 */
const modSqrt = (n: bigint, p: bigint): bigint => {
    let s = 1n;

    while ((p - 1n) % 2n ** s === 0n) {
        ++s;
    }
    --s;

    const q = (p - 1n) / 2n ** s;

    let z = 1n;
    let res = power(z, (p - 1n) / 2n, p);

    while (res !== p - 1n) {
        ++z;
        res = power(z, (p - 1n) / 2n, p);
    }

    let c = power(z, q, p);
    let r = power(n, (q + 1n) / 2n, p);
    let t = power(n, q, p);
    let m = s;

    while (t !== 1n) {
        let i = 1n;
        let t2 = (t * t) % p;
        while (t2 !== 1n) {
            t2 = (t2 * t2) % p;
            ++i;
        }
        const b = power(c, power(2n, m - i - 1n, p), p);
        r = (r * b) % p;
        c = (b * b) % p;
        t = (t * c) % p;
        m = i;
    }

    return r;
};

export const deriveYCoordinate = (x: bigint, odd: boolean, curve: Curve): bigint => {
    const y = modSqrt(x ** 3n + curve.a * x + curve.b, curve.p);
    // eslint-disable-next-line no-bitwise
    const isOdd = !!(y & 1n);

    return isOdd === odd ? y : curve.p - y;
};

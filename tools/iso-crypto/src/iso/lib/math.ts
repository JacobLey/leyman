/* eslint-disable @typescript-eslint/no-magic-numbers -- The curves' constants, and small integers of the math */

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
    return result < 0n ? result + mod : result;
};

/**
 * Modular inverse by the extended Euclidean algorithm.
 *
 * @see {@link https://en.wikipedia.org/wiki/Extended_Euclidean_algorithm#Modular_integers}
 *
 * @param a - value, not a multiple of `mod`
 * @param mod - prime modulus
 * @returns `x` in `[0, mod)` with `a * x ≡ 1 (mod mod)`
 */
const modularInverse = (a: bigint, mod: bigint): bigint => {
    let [oldR, r] = [positiveMod(a, mod), mod];
    let [oldS, s] = [1n, 0n];
    while (r !== 0n) {
        const quotient = oldR / r;
        [oldR, r] = [r, oldR - quotient * r];
        [oldS, s] = [s, oldS - quotient * s];
    }
    return positiveMod(oldS, mod);
};

/**
 * A point in Jacobian coordinates: `x = X / Z^2`, `y = Y / Z^3`. Adding and doubling in them needs no modular
 * inverse, the costly step, so a whole multiplication needs only one, to convert back.
 *
 * @see {@link https://hyperelliptic.org/EFD/g1p/auto-shortw-jacobian.html}
 */
interface JacobianPoint {
    readonly x: bigint;
    readonly y: bigint;
    readonly z: bigint;
}

/**
 * Double a point (`dbl-2007-bl`). Never called on the point at infinity, nor on a point with `y = 0`: neither occurs
 * while multiplying the base point by a private key, which is below the curve's order.
 *
 * @see {@link https://hyperelliptic.org/EFD/g1p/auto-shortw-jacobian.html#doubling-dbl-2007-bl}
 *
 * @param point - point to double
 * @param curve - curve specification
 * @returns `2 * point`
 */
const doublePoint = ({ x, y, z }: JacobianPoint, { a, p }: Curve): JacobianPoint => {
    const xx = (x * x) % p;
    const yy = (y * y) % p;
    const yyyy = (yy * yy) % p;
    const zz = (z * z) % p;
    const s = (2n * ((x + yy) ** 2n - xx - yyyy)) % p;
    const m = (3n * xx + ((a * zz) % p) * zz) % p;
    const t = positiveMod(m * m - 2n * s, p);
    return {
        x: t,
        y: positiveMod(m * (s - t) - 8n * yyyy, p),
        z: positiveMod((y + z) ** 2n - yy - zz, p),
    };
};

/**
 * Add two distinct points (`add-2007-bl`), neither the point at infinity nor the other's negation: in the Montgomery
 * ladder they always differ by the base point.
 *
 * @see {@link https://hyperelliptic.org/EFD/g1p/auto-shortw-jacobian.html#addition-add-2007-bl}
 *
 * @param first - point
 * @param second - another point
 * @param curve - curve specification
 * @returns `first + second`
 */
const addPoints = (first: JacobianPoint, second: JacobianPoint, { p }: Curve): JacobianPoint => {
    const z1z1 = (first.z * first.z) % p;
    const z2z2 = (second.z * second.z) % p;
    const u1 = (first.x * z2z2) % p;
    const u2 = (second.x * z1z1) % p;
    const s1 = (((first.y * second.z) % p) * z2z2) % p;
    const s2 = (((second.y * first.z) % p) * z1z1) % p;
    const h = positiveMod(u2 - u1, p);
    const i = (4n * h * h) % p;
    const j = (h * i) % p;
    const r = positiveMod(2n * (s2 - s1), p);
    const v = (u1 * i) % p;
    const x = positiveMod(r * r - j - 2n * v, p);
    return {
        x,
        y: positiveMod(r * (v - x) - 2n * s1 * j, p),
        z: positiveMod(((first.z + second.z) ** 2n - z1z1 - z2z2) * h, p),
    };
};

/**
 * Derives coordinates of ECC public key given private key (random number) and curve.
 *
 * A Montgomery ladder: every bit of the key takes one addition and one doubling, whatever its value, so the steps
 * don't follow the key's bits the way double-and-add's do. BigInt arithmetic isn't constant-time, so this narrows a
 * timing side channel rather than closing it.
 *
 * @see {@link https://en.wikipedia.org/wiki/Elliptic_curve_point_multiplication#Montgomery_ladder}
 *
 * @param privateKey - random number in `[1, n)`, `n` the curve's order
 * @param curve - Curve specification
 * @returns public key point
 */
export const derivePublicKey = (privateKey: bigint, curve: Curve): Point => {
    const base: JacobianPoint = { ...curve.g, z: 1n };
    // `low` is `m * G` for the bits of the key read so far, `high` is `(m + 1) * G`. Neither is ever the point at
    // infinity, as `m + 1` never exceeds the key, which is below the curve's order.
    let low = base;
    let high = doublePoint(base, curve);
    // eslint-disable-next-line @typescript-eslint/no-misused-spread -- Binary digits, all ASCII
    for (const bit of [...privateKey.toString(2)].slice(1)) {
        if (bit === '1') {
            low = addPoints(low, high, curve);
            high = doublePoint(high, curve);
        } else {
            high = addPoints(low, high, curve);
            low = doublePoint(low, curve);
        }
    }
    const zInverse = modularInverse(low.z, curve.p);
    const zInverse2 = (zInverse * zInverse) % curve.p;
    return {
        x: (low.x * zInverse2) % curve.p,
        y: (((low.y * zInverse2) % curve.p) * zInverse) % curve.p,
    };
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
    // eslint-disable-next-line @typescript-eslint/no-misused-spread -- Binary digits, all ASCII
    const bits = [...y.toString(2)].toReversed();

    for (const bit of bits) {
        if (bit === '1') {
            res = (res * x2) % p;
        }
        x2 = (x2 * x2) % p;
    }
    return res;
};

/**
 * Square root modulo `p`: solves y^2 = n % p for y.
 *
 * Every supported curve's prime is 3 mod 4, where the root is n^((p + 1) / 4).
 *
 * @param n - value to take the root of, in `[0, p)`
 * @param p - prime modulus, 3 mod 4
 * @returns y
 * @throws {Error} if `n` has no square root, so no point has this x coordinate
 */
const modSqrt = (n: bigint, p: bigint): bigint => {
    const root = power(n, (p + 1n) / 4n, p);
    if ((root * root) % p !== n) {
        throw new Error('Public key is not a point on the curve');
    }
    return root;
};

/**
 * Y coordinate of the point with this x coordinate, and the given parity.
 *
 * @param x - x coordinate
 * @param isOdd - whether y is odd
 * @param curve - curve the point is on
 * @returns y
 * @throws {Error} if no point on the curve has this x coordinate
 */
export const deriveYCoordinate = (x: bigint, isOdd: boolean, curve: Curve): bigint => {
    if (x >= curve.p) {
        throw new Error('Public key is not a point on the curve');
    }
    const y = modSqrt(positiveMod(x ** 3n + curve.a * x + curve.b, curve.p), curve.p);
    const isRootOdd = !!(y & 1n);

    return isRootOdd === isOdd ? y : curve.p - y;
};

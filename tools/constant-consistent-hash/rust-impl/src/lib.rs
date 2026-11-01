//! Maps keys to buckets in constant time, with no loops over buckets.
//!
//! Implements the specification of the constant-consistent-hash npm package, and returns the same buckets:
//! <https://github.com/JacobLey/leyman/blob/main/tools/constant-consistent-hash/constant-consistent-hash/SPEC.md>

use std::error::Error;
use std::fmt;

#[cfg(target_arch = "wasm32")]
mod wasm;

/// The largest number of buckets: the key's hash provides 48 bits for selecting blocks.
pub const MAX_BUCKETS: u64 = 1 << 48;

/// 2^53, for dividing a 53 bit integer down to [0, 1).
const TWO_POW_53: f64 = 9_007_199_254_740_992.0;

/// The number of buckets is not between 1 and [`MAX_BUCKETS`].
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BucketsOutOfBounds(pub u64);

impl fmt::Display for BucketsOutOfBounds {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "buckets must be between 1 and 2^48, received {}", self.0)
    }
}

impl Error for BucketsOutOfBounds {}

/// Which random value of a block is drawn.
#[derive(Clone, Copy)]
enum Salt {
    Top = 0,
    Pair = 1,
    Second = 2,
}

const fn mix32(seed: u32, index: u32) -> u32 {
    let mut x = seed.wrapping_add(index.wrapping_add(1).wrapping_mul(0x9e37_79b9));
    x ^= x >> 16;
    x = x.wrapping_mul(0x7feb_352d);
    x ^= x >> 15;
    x = x.wrapping_mul(0x846c_a68b);
    x ^ (x >> 16)
}

/// The two 32 bit words a key hashes to.
#[derive(Clone, Copy)]
struct Hash {
    a: u32,
    b: u32,
}

impl Hash {
    fn of(key: &str, seed: u32) -> Self {
        let mut h1 = 0xdead_beef ^ seed;
        let mut h2 = 0x41c6_ce57 ^ seed;
        for &byte in key.as_bytes() {
            h1 = (h1 ^ u32::from(byte)).wrapping_mul(2_654_435_761);
            h2 = (h2 ^ u32::from(byte)).wrapping_mul(1_597_334_677);
        }

        h1 = (h1 ^ (h1 >> 16)).wrapping_mul(2_246_822_507);
        h1 ^= (h2 ^ (h2 >> 13)).wrapping_mul(3_266_489_909);
        h2 = (h2 ^ (h2 >> 16)).wrapping_mul(2_246_822_507);
        h2 ^= (h1 ^ (h1 >> 13)).wrapping_mul(3_266_489_909);

        // The specification only wraps this length modulo 2^32, as with every u32
        #[allow(
            clippy::cast_possible_truncation,
            reason = "u32 arithmetic wraps by definition in the specification"
        )]
        let length = key.len() as u32;
        Self {
            a: h1,
            b: mix32(h2, length),
        }
    }

    /// The 64 bit random value `hi × 2^32 + lo`.
    fn random(self, block: u32, salt: Salt) -> u64 {
        let index = block * 3 + salt as u32;
        (u64::from(mix32(self.b, index)) << 32) | u64::from(mix32(self.a, index))
    }

    /// Top 53 bits of the random value, divided by 2^53: in [0, 1), and exact in an f64.
    fn uniform(self, block: u32, salt: Salt) -> f64 {
        #[allow(
            clippy::cast_precision_loss,
            reason = "53 bit integers are exact in an f64"
        )]
        let top_bits = (self.random(block, salt) >> 11) as f64;
        top_bits / TWO_POW_53
    }

    /// Top `block` bits of the random value.
    fn offset(self, block: u32) -> u64 {
        // A u64 can't shift by 64, for block 0
        self.random(block, Salt::Top)
            .checked_shr(64 - block)
            .unwrap_or(0)
    }

    /// Bucket in [0, 2^power), for a number of buckets that is a power of 2.
    fn power_of_two(self, power: u32) -> u64 {
        let bits = (u64::from(self.b >> 16) << 32) | u64::from(self.a);
        let k = bits & ((1 << power) - 1);
        if k == 0 {
            return 0;
        }
        let block = k.ilog2();
        (1 << block) + self.offset(block)
    }
}

/// The hash of a key's UTF-8 bytes that [`bucket`] places it with: two independent 32 bit words.
///
/// For building other hashing schemes on, such as rendezvous hashing. Not cryptographic.
#[must_use]
pub fn hash_key(key: &str, seed: u32) -> [u32; 2] {
    let Hash { a, b } = Hash::of(key, seed);
    [a, b]
}

/// Maps a key to a bucket in [0, buckets), in constant time.
///
/// Every bucket is equally likely. When `buckets` grows by one, a key either keeps its bucket, or moves to the new
/// bucket (`buckets - 1`), so only `1 / buckets` of keys move.
///
/// The seed selects an independent hash function, use 0 by default.
///
/// # Errors
///
/// [`BucketsOutOfBounds`] when `buckets` is not between 1 and [`MAX_BUCKETS`].
pub fn bucket(key: &str, buckets: u64, seed: u32) -> Result<u64, BucketsOutOfBounds> {
    if !(1..=MAX_BUCKETS).contains(&buckets) {
        return Err(BucketsOutOfBounds(buckets));
    }

    let hash = Hash::of(key, seed);
    let power = (buckets - 1).bit_width();
    let top = hash.power_of_two(power);
    if top < buckets {
        return Ok(top);
    }

    // The top block [h, 2h) holds `top`, the highest bucket the key lands on, which is out of range.
    // It holds a second bucket with probability 2h(top - h) / top(top + 1), uniform in [h, top).
    let block = power - 1;
    let h = 1_u64 << block;

    // Bucket numbers are at most 2^48, so exact in an f64. Rust never fuses or reorders these operations
    #[allow(
        clippy::cast_precision_loss,
        reason = "integers up to 2^48 are exact in an f64"
    )]
    let (top_f, h_f) = (top as f64, h as f64);
    if hash.uniform(block, Salt::Pair) * top_f * (top_f + 1.0) < 2.0 * h_f * (top_f - h_f) {
        #[allow(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "the floor of a value in [0, 2^48) is an exact, non-negative integer"
        )]
        let second = h + (hash.uniform(block, Salt::Second) * (top_f - h_f)).floor() as u64;
        if second < buckets {
            return Ok(second);
        }
    }

    // Nothing in the top block is in range, so fall back to the lower blocks
    Ok(hash.power_of_two(block))
}

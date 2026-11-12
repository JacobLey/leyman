use std::error::Error;

use constant_consistent_hash_rust::{
    BucketsOutOfBounds, MAX_BUCKETS, SPEC_VERSION, bucket, hash_key,
};
use serde_json::Value;

fn keys() -> Vec<String> {
    (0..1000)
        .map(|i| format!("00000000-0000-4000-8000-{i:012x}"))
        .collect()
}

fn in_bounds(key: &str, buckets: u64, seed: u32) -> u64 {
    bucket(key, buckets, seed).expect("buckets in bounds")
}

/// How many keys changed bucket when `from` grew by one, and how many went somewhere other than the new bucket.
fn count_moved(from: u64, seed: u32) -> (usize, usize) {
    let mut moved = 0;
    let mut disrupted = 0;
    for key in keys() {
        let after = in_bounds(&key, from + 1, seed);
        if in_bounds(&key, from, seed) != after {
            moved += 1;
            if after != from {
                disrupted += 1;
            }
        }
    }
    (moved, disrupted)
}

fn number(value: &Value) -> u64 {
    value.as_u64().expect("unsigned integer")
}

#[test]
fn matches_test_vectors() {
    let vectors: Value = serde_json::from_str(testvectors::JSON).expect("valid JSON");
    assert_eq!(vectors["specVersion"].as_str(), Some(SPEC_VERSION));
    let ranges = vectors["ranges"].as_array().expect("array");
    let vectors = vectors["vectors"].as_array().expect("array");
    assert_ne!(vectors.len(), 0);

    for vector in vectors {
        let description = vector["description"].as_str().expect("string");
        let key = vector["key"].as_str().expect("string");
        let seed = u32::try_from(number(&vector["seed"])).expect("u32");

        let expected: Vec<u64> = vector["hash"]
            .as_array()
            .expect("array")
            .iter()
            .map(number)
            .collect();
        let [a, b] = hash_key(key, seed);
        assert_eq!(
            [u64::from(a), u64::from(b)].as_slice(),
            expected,
            "{description}"
        );

        let buckets = vector["buckets"].as_array().expect("array");
        for (range, expected) in ranges.iter().zip(buckets) {
            let range = number(range);
            assert_eq!(
                in_bounds(key, range, seed),
                number(expected),
                "{description} with {range} buckets"
            );
        }
    }
}

#[test]
fn returns_bucket_within_range() {
    for buckets in [1, 2, 7, 100, (1 << 32) + 1, MAX_BUCKETS] {
        for key in keys() {
            assert!(in_bounds(&key, buckets, 0) < buckets);
        }
    }
}

#[test]
fn balances_keys_across_buckets() {
    const BUCKETS: usize = 7;
    const TOTAL: u32 = 70_000;
    let mut counts = [0_u32; BUCKETS];
    for i in 0..TOTAL {
        let index = usize::try_from(in_bounds(&format!("key-{i}"), 7, 0)).expect("below 7");
        counts[index] += 1;
    }

    let expected = f64::from(TOTAL) / 7.0;
    let chi_square: f64 = counts
        .iter()
        .map(|&count| (f64::from(count) - expected).powi(2) / expected)
        .sum();
    // 99.9th percentile of chi-square with 6 degrees of freedom
    assert!(chi_square < 22.46, "chi-square {chi_square}, {counts:?}");
}

#[test]
fn only_moves_keys_to_new_bucket() {
    let froms = (1..=200).chain([(1 << 32) - 1, 1 << 32, MAX_BUCKETS - 1]);
    for from in froms {
        for seed in [0, 123] {
            assert_eq!(count_moved(from, seed).1, 0, "from {from}, seed {seed}");
        }
    }
}

#[test]
fn moves_one_over_range_of_keys() {
    // Expect 100, standard deviation ~9.5
    let (moved, _) = count_moved(9, 0);
    assert!((70..=130).contains(&moved), "moved {moved}");
}

#[test]
fn moves_almost_no_keys_when_large_range_grows() {
    // Each block boundary where positions switch from one random word to two
    for from in [
        1 << 31,
        1 << 32,
        (1 << 32) + (1 << 31),
        1 << 33,
        1 << 47,
        MAX_BUCKETS - 1,
    ] {
        assert_eq!(count_moved(from, 0).0, 0, "from {from}");
    }
}

#[test]
fn seed_selects_independent_hash() {
    let same = keys()
        .iter()
        .filter(|key| in_bounds(key, 100, 0) == in_bounds(key, 100, 1))
        .count();
    // Expect 1/100 of keys (10) to match by chance
    assert!(same < 30, "{same} keys matched across seeds");
}

#[test]
fn rejects_buckets_out_of_bounds() {
    for buckets in [0, MAX_BUCKETS + 1] {
        let error = bucket("key", buckets, 0).expect_err("out of bounds");
        assert_eq!(error, BucketsOutOfBounds(buckets));
        assert_eq!(
            error.to_string(),
            format!("buckets must be between 1 and 2^48, received {buckets}")
        );
        assert!(Error::source(&error).is_none());
    }
}

use std::fmt::Write;

use demo_blake3_wasm::hash;
use serde_json::Value;

const TEST_VECTORS: &str = include_str!("../data/test-vectors.json");

#[test]
fn matches_official_test_vectors() {
    let vectors: Value = serde_json::from_str(TEST_VECTORS).expect("valid JSON");
    let cases = vectors["cases"].as_array().expect("array");
    assert_ne!(cases.len(), 0);

    for case in cases {
        let length = usize::try_from(case["inputLength"].as_u64().expect("integer")).expect("fits");
        // Each input repeats the bytes 0 to 250
        let input: Vec<u8> = (0..=250_u8).cycle().take(length).collect();

        let mut actual = String::new();
        for byte in hash(&input) {
            write!(actual, "{byte:02x}").expect("writing to a string");
        }
        assert_eq!(
            actual,
            case["hash"].as_str().expect("string"),
            "{length} bytes"
        );
    }
}

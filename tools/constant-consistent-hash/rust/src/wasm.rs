//! Bindings to JavaScript, compiled only for WASM. No logic: every export is one call into the pure core, so the tests
//! of `@leyman/constant-consistent-hash-wasm`, which run every test vector through here, are what cover this file.

// `#[wasm_bindgen]` generates the unsafe FFI, none is written here
#![allow(unsafe_code)]

use wasm_bindgen::prelude::{JsError, wasm_bindgen};

/// See [`crate::hash_key`].
#[wasm_bindgen(js_name = hashKey)]
#[must_use]
pub fn hash_key(key: &str, seed: u32) -> Vec<u32> {
    crate::hash_key(key, seed).to_vec()
}

/// See [`crate::bucket`].
///
/// # Errors
///
/// A JavaScript `Error` when `buckets` is out of bounds.
#[wasm_bindgen]
pub fn bucket(key: &str, buckets: u64, seed: u32) -> Result<u64, JsError> {
    crate::bucket(key, buckets, seed).map_err(|error| JsError::new(&error.to_string()))
}

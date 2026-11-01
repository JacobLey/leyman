//! Bindings to JavaScript, compiled only for WASM. No logic: `@leyman/demo-blake3-wasm`'s tests run every test vector
//! through here, which is what covers this file.

// `#[wasm_bindgen]` generates the unsafe FFI, none is written here
#![allow(unsafe_code)]

use wasm_bindgen::prelude::wasm_bindgen;

/// See [`crate::hash`]. The bindings copy `bytes` into WASM's memory, and the result out of it.
#[wasm_bindgen]
#[must_use]
pub fn hash(bytes: &[u8]) -> Vec<u8> {
    crate::hash(bytes).to_vec()
}

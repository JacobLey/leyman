//! BLAKE3, for the blake3-go demo: one function, so what the demo measures is the hash and the boundary around it.

#[cfg(target_arch = "wasm32")]
mod ffi;

/// The BLAKE3 hash of some bytes.
#[must_use]
pub fn hash(bytes: &[u8]) -> [u8; 32] {
    *blake3::hash(bytes).as_bytes()
}

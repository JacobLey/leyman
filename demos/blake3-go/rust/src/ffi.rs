//! A C ABI for hosts other than JavaScript, compiled only for WASM. No logic beyond moving bytes: `@leyman/demo-blake3-go`'s
//! tests run every test vector through here, which is what covers this file.
//!
//! WASM functions only take and return numbers, so the host writes its input into this module's memory and reads the
//! output back from it. [`alloc`] reserves the room for that, and [`dealloc`] gives it back.

// Raw pointers are the only way to share memory with the host. Each function states what it relies on
#![allow(unsafe_code)]

/// Reserves `len` bytes of this module's memory, for the host to write into.
///
/// Traps when the memory can't grow that far.
#[unsafe(no_mangle)]
#[must_use]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len);
    let pointer = buffer.as_mut_ptr();
    // The host owns it now, until it calls `dealloc`
    core::mem::forget(buffer);
    pointer
}

/// Frees what [`alloc`] reserved.
///
/// # Safety
///
/// `pointer` and `len` are exactly what one call to [`alloc`] took and returned, freed only once.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn dealloc(pointer: *mut u8, len: usize) {
    // SAFETY: the caller passes back what `alloc` made, which is a `Vec` with this capacity
    drop(unsafe { Vec::from_raw_parts(pointer, 0, len) });
}

/// Writes the [`crate::hash`] of the `len` bytes at `input` to the 32 bytes at `output`.
///
/// # Safety
///
/// `input` is from [`alloc`] and holds at least `len` bytes, and `output` is from [`alloc`] with at least 32.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn hash(input: *const u8, len: usize, output: *mut u8) {
    // SAFETY: the caller guarantees both regions, and `alloc` never returns null, even for no bytes
    let bytes = unsafe { core::slice::from_raw_parts(input, len) };
    let hash = crate::hash(bytes);
    // SAFETY: as above
    unsafe { core::ptr::copy_nonoverlapping(hash.as_ptr(), output, hash.len()) };
}

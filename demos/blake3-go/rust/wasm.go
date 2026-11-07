// Package blake3wasm embeds this crate's build for WASM, and its test vectors, for Go.
//
// The build is in dist/, which is not committed: Nx builds it before anything that imports this package.
package blake3wasm

import _ "embed"

// Module is the crate compiled to WASM, from dist/demo_blake3_go.wasm.
//
//go:embed dist/demo_blake3_go.wasm
var Module []byte

// TestVectors is the content of data/test-vectors.json.
//
//go:embed data/test-vectors.json
var TestVectors []byte

module github.com/JacobLey/leyman/demos/blake3-go/go

go 1.26

require (
	github.com/JacobLey/leyman/demos/blake3-go/rust v0.0.0
	github.com/tetratelabs/wazero v1.12.0
	github.com/zeebo/blake3 v0.2.4
)

require (
	github.com/klauspost/cpuid/v2 v2.0.12 // indirect
	golang.org/x/sys v0.44.0 // indirect
)

// A workspace project, never fetched
replace github.com/JacobLey/leyman/demos/blake3-go/rust => ../rust

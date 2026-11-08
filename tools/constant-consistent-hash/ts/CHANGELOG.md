# constant-consistent-hash

## 0.2.2

### Patch Changes

- a66d307: Require Node.js 22.12.0 or later (`engines.node` was `>=22`). 22.12.0 is the oldest Node.js where the test runner starts, since mocha needs `require()` of ES modules, so it is the oldest version the package is tested on. Nothing changed for Node.js 22.12 and later.

## 0.2.1

### Patch Changes

- 1bb6371: The package's repository directory is now `tools/constant-consistent-hash/ts`, beside the Go, Rust and WASM implementations and the shared test vectors, and the README's links to the specification and the other implementations follow it.

## 0.2.0

### Minor Changes

- 8461cca: Supports Node.js 22: `engines.node` is now `>=22`, down from `>=24`. The package uses no API newer than Node.js 22 has, and is built and tested against it.

## 0.1.0

### Minor Changes

- dc55aa9: Initial release: `consistentHash(key, range, options?)` maps keys to buckets in constant time with no loops, keeps buckets evenly balanced, and only moves keys to the new bucket when the range grows. Includes a `seed` option for independent hash functions, and a language-independent specification with test vectors.

# constant-consistent-hash

## 0.2.0

### Minor Changes

- 8461cca: Supports Node.js 22: `engines.node` is now `>=22`, down from `>=24`. The package uses no API newer than Node.js 22 has, and is built and tested against it.

## 0.1.0

### Minor Changes

- dc55aa9: Initial release: `consistentHash(key, range, options?)` maps keys to buckets in constant time with no loops, keeps buckets evenly balanced, and only moves keys to the new bucket when the range grows. Includes a `seed` option for independent hash functions, and a language-independent specification with test vectors.

---
"constant-consistent-hash": minor
---

Initial release: `consistentHash(key, range, options?)` maps keys to buckets in constant time with no loops, keeps buckets evenly balanced, and only moves keys to the new bucket when the range grows. Includes a `seed` option for independent hash functions, and a language-independent specification with test vectors.

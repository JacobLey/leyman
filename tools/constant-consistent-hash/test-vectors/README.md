# constant-consistent-hash-test-vectors

Test vectors shared by every [constant-consistent-hash](../constant-consistent-hash/) implementation.

Each implementation depends on this package, through its own package manager, and asserts that it returns exactly these buckets, so the TypeScript package and the [Go implementation](../go-impl/) are held to the same [specification](../constant-consistent-hash/SPEC.md), not to each other.

```ts
import testVectors from '@leyman/constant-consistent-hash-test-vectors/test-vectors.json' with { type: 'json' };
```

It is also a Go module, embedding the same file:

```go
import testvectors "github.com/JacobLey/leyman/tools/constant-consistent-hash/test-vectors"

json.Unmarshal(testvectors.JSON, &vectors)
```

The module is not published, so require it with a `replace` pointing at this directory (see the [Go implementation](../go-impl/go.mod)). Implementations in other languages can read [`data/test-vectors.json`](./data/test-vectors.json) directly.

## Format

```json
{
  "ranges": [1, 2, 7],
  "vectors": [
    { "description": "UUID", "key": "00000000-0000-4000-8000-000000000000", "seed": 0, "hash": [865118427, 3574204183], "buckets": [0, 1, 2] }
  ]
}
```

`hash` is `hashKey(key, { seed })`, and `buckets[i]` is `consistentHash(key, ranges[i], { seed })`. Keys are Unicode strings, hashed as UTF-8.

Ranges go past 2^32 and up to 2^48, where a position within a block draws both 32-bit words, so read buckets and ranges as 64-bit integers (or doubles).

Changing the algorithm means regenerating every bucket, and every implementation must then agree on the new values.

It is not published, and should not be depended on by published code.

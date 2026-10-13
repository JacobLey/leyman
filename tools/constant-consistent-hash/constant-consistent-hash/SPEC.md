# constant-consistent-hash specification

Back to the [README](https://www.npmjs.com/package/constant-consistent-hash).

This describes `consistentHash(key, range, { seed })` precisely enough for any language to return the same buckets as the JavaScript implementation. For why the algorithm works, see [WHY-CONSTANT-CONSISTENT-HASH.md](https://github.com/JacobLey/leyman/blob/main/tools/constant-consistent-hash/constant-consistent-hash/WHY-CONSTANT-CONSISTENT-HASH.md).

## Conventions

- **u32**: unsigned 32-bit integer. Every u32 operation wraps modulo 2^32.
- `imul(a, b)`: low 32 bits of `a × b`.
- `>>>`: logical (unsigned) right shift. `^`, `&`, `|`: bitwise xor, and, or.
- **f64**: IEEE-754 binary64 with round-to-nearest-even. Only used in the two marked steps below, evaluated in exactly the order written. No expression has the shape `a × b + c`, so fused multiply-add contraction does not change results, but do not enable "fast math" style reassociation.
- Integers up to 2^53 (bucket numbers, `range`) are exact in f64 or a 64-bit integer.

## Inputs

| Input | Description |
|---|---|
| `key` | Unicode string, hashed as its UTF-8 bytes. Lone surrogates (only possible in UTF-16 strings) are encoded as U+FFFD (`EF BF BD`). |
| `range` | Integer, `1 ≤ range ≤ 2^48`. |
| `seed` | u32, default `0`. |

Implementations should reject a `range` or `seed` out of bounds.

## Steps

### `mix32(seed, index)` → u32

```
x = seed + imul(index + 1, 0x9e3779b9)
x = x ^ (x >>> 16)
x = imul(x, 0x7feb352d)
x = x ^ (x >>> 15)
x = imul(x, 0x846ca68b)
x = x ^ (x >>> 16)
return x
```

### `hashKey(bytes, seed)` → `a, b`, two u32

```
h1 = 0xdeadbeef ^ seed
h2 = 0x41c6ce57 ^ seed
for each byte b of bytes:
    h1 = imul(h1 ^ b, 2654435761)
    h2 = imul(h2 ^ b, 1597334677)

h1 = imul(h1 ^ (h1 >>> 16), 2246822507)
h1 = h1 ^ imul(h2 ^ (h2 >>> 13), 3266489909)
h2 = imul(h2 ^ (h2 >>> 16), 2246822507)
h2 = h2 ^ imul(h1 ^ (h1 >>> 13), 3266489909)

a = h1
b = mix32(h2, length of bytes)
```

### `random(block, salt)` → `hi, lo`, two u32

The 64-bit random value `hi × 2^32 + lo` for a block. `salt` is `0` (top), `1` (pair) or `2` (second).

```
index = block × 3 + salt
hi = mix32(b, index)
lo = mix32(a, index)
```

Only its top bits are used, so `lo` is only needed for `random53`, and for `offset` above block 32:

- `random53(block, salt) = hi × 2^21 + (lo >>> 11)`, the top 53 bits. `uniform(block, salt)` is `random53(block, salt) / 2^53`, which is exact in f64.
- `offset(block)` is the top `block` bits of `random(block, 0)`:

```
if block = 0:  return 0
if block ≤ 32: return hi >>> (32 - block)
               return hi × 2^(block - 32) + (lo >>> (64 - block))
```

The first two cases are separate as many languages (JavaScript included) do not shift a u32 by 32.

### `bitLength(x)`

Number of bits needed to represent `x`: `0` for `0`, otherwise one more than the index of the highest set bit.

### `f(m)` → integer in `[0, m)`, for a power of 2 `m ≤ 2^48`

```
bits = (b >>> 16) × 2^32 + a                   48-bit integer
k = bits mod m                                 the low log2(m) bits
if k = 0: return 0
j = bitLength(k) - 1
return 2^j + offset(j)
```

### `consistentHash(key, range, seed)`

```
a, b = hashKey(UTF-8 bytes of key, seed)
p = bitLength(range - 1)
m = 2^p

top = f(m)
if top < range: return top

j = p - 1
h = 2^j

[f64]  if (uniform(j, 1) × top) × (top + 1) < 2h × (top - h):
[f64]      second = h + floor(uniform(j, 2) × (top - h))
           if second < range: return second

return f(h)
```

In the first f64 step, the left side is rounded twice, after each multiplication, and the right side is exact. In the second, `uniform × (top - h)` is rounded once before `floor`.

## Test vectors

[`test-vectors.json`](https://github.com/JacobLey/leyman/blob/main/tools/constant-consistent-hash/test-vectors/data/test-vectors.json) lists `consistentHash(key, range, { seed })` for keys covering every UTF-8 encoded length, seeds, and ranges up to 2^48. `buckets[i]` is the bucket for `ranges[i]`.

Both this package and the [Go implementation](https://github.com/JacobLey/leyman/tree/main/tools/constant-consistent-hash/go-impl) are tested against them.

A complete implementation should also pass the package's property tests: for many keys, growing `range` by one never moves a key anywhere but the new bucket `range`.

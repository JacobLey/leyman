<div style="text-align:center">

<h1>iso-crypto</h1>
<p>Cryptographic methods that work in isomorphic (Browser + NodeJS) environments.</p>

[![npm package](https://badge.fury.io/js/iso-crypto.svg)](https://www.npmjs.com/package/iso-crypto)
[![License](https://img.shields.io/npm/l/iso-crypto.svg)](https://github.com/JacobLey/leyman/blob/main/common/config/publish/LICENSE)
[![Quality](https://img.shields.io/npms-io/quality-score/iso-crypto.svg)](https://github.com/JacobLey/leyman/blob/main/tools/iso-crypto)

</div>

## Contents
- [Introduction](#introduction)
- [Supported Algorithms](#supported-algorithms)
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [Implementation Details](#implementation-details)
- [API](#api)

<a name="Introduction"></a>
## Introduction

IsoCrypto provides a common interface for cryptographic methods for both NodeJS and Browser environments. On NodeJS it generally relies on the [`node:crypto`](https://nodejs.org/api/crypto.html) module, and on Browser based on [`window.crypto.subtle`](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto).

Some lower level isomorphic utilities are also provided, such as text encoding and random byte generation.

<a name="Supported Algorithms"></a>
## Supported Algorithms

### Hash

* ✅ sha1
* ✅ sha256
* ✅ sha384
* ✅ sha512

### Symmetric Encryption

* ✅ aes-128-cbc
* ✅ aes-192-cbc
* ✅ aes-256-cbc
* ✅ aes-128-ctr
* ✅ aes-192-ctr
* ✅ aes-256-ctr

### ECDH (Asymmetric)

* ✅ prime256v1
* ✅ secp384r1
* ✅ secp521r1

<a name="Install"></a>
## Install

```sh
npm i iso-crypto
```

<a name="Example"></a>
## Example

### Encoding

```ts
import { decode, encode } from 'iso-crypto';

const buffer: Uint8Array = decode('This is my text');
const encoded = encode(buffer); // 'This is my text'
```

### Random

```ts
import { randomBytes } from 'iso-crypto';

const rand: Uint8Array = await randomBytes(10);
```

### Hash

```ts
import { encode, hash } from 'iso-crypto';

const hashed: Uint8Array = await hash('This is my text');
encode(hashed, 'hex'); // 04405de6b2dcefcd85a03503cefad765a88c8083c5fede2eb7e4354e5643e2df

const customHashed: Uint8Array = await hash(
    { text: 'abc123', encoding: 'hex' },
    {
        algorithm: 'SHA2',
        size: 512,
    }
);
encode(customHashed, 'base64'); // 8ff0IFBTdySF86lYF23zbCfmerD9ieLgid5Ak+5pRwffOgSY8yQ78HifX0lxZ0hKHZP4uZ0Nfr9dcwZmo5Mkfw==
```

### Symmetric Encryption

```ts
import { decrypt, encode, encrypt } from 'iso-crypto';

const secret = 'Super duper secret password';

const encrypted = await encrypt({
    data: 'This is my message',
    secret,
});
const decrypted = encode(await decrypt({
    ...encrypted,
    secret,
})); // 'This is my message'

const customAlgEncrypted = await encrypt(
    {
        data: 'This is my response',
        secret,
    },
    {
        hash: { algorithm: 'SHA1' },
        encryption: {
            cipher: 'AES',
            size: 192,
            mode: 'CBC',
        },
    }
);
const customAlgDecrypted = encode(await decrypt(
    {
        ...customAlgEncrypted,
        secret,
    },
    {
        hash: { algorithm: 'SHA1' },
        encryption: {
            cipher: 'AES',
            size: 192,
            mode: 'CBC',
        },
    }
)); // 'This is my response'
```

### ECC

```ts
import { eccDecrypt, eccEncrypt, encode, generateEccPrivateKey, generateEccPublicKey } from 'iso-crypto';

const anne: Uint8Array = await generateEccPrivateKey();
const bob: Uint8Array = await generateEccPrivateKey();

const fromAnneEncrypted = await eccEncrypt({
    data: 'Hello, would you like a cup to tea?',
    privateKey: anne,
    publicKey: generateEccPublicKey(bob),
});
const fromAnneDecrypted = encode(await eccDecrypt({
    ...fromAnneEncrypted,
    privateKey: bob,
})); // 'Hello, would you like a cup to tea?'

const fromBobEncrypted = await eccEncrypt(
    {
        data: 'I am more of a coffee drinker myself',
        privateKey: bob,
        publicKey: generateEccPublicKey(anne),
    },
    {
        encryption: {
            cipher: 'AES',
            size: 128,
            mode: 'CTR',
        },
    }
);
const fromBobDecrypted = encode(await eccDecrypt(
    {
        ...fromBobEncrypted,
        privateKey: anne,
    },
    {
        encryption: {
            cipher: 'AES',
            size: 128,
            mode: 'CTR',
        },
    }
)); // 'I am more of a coffee drinker myself'
```

<a name="Usage"></a>
## Usage

iso-crypto is an ESM module. That means it _must_ be `import`ed. To load from a CJS module, use dynamic import `const { eccEncrypt } = await import('iso-crypto');`.

Most cryptographic methods return instances of [`Uint8Array`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array), instead of strings. Those can encoded as text via the `encode` method. In NodeJS the response is often actually a [`Buffer`](https://nodejs.org/api/buffer.html) which extends `Uint8Array`.

Any method that takes input "text" allows 3 formats:
* string - inferred as `UTF8` encoding
* Uint8Array - "raw" encoding
* { text: string; encoding: string } - text with a custom encoding
    * Supported encodings: `hex`, `base64`, `base64url`, `utf8`

Any method that performs hashing can take the Hash algorithm as an option. The default algorithm is `SHA256`. In any case where hashing _should not_ be used (e.g. custom hashing already implemented), declare the `raw` option.

e.g.
```ts
import { encrypt } from 'iso-crypto';

await encrypt(
    {
        data: 'My message',
        secret: 'Already hashed',
    },
    {
        hash: 'raw',
    }
);
```

Any method that performs symmetric encryption can take the encryption algorithm as an option. The default algorithm is `aes-256-ctr` (`{ cipher: 'AES', size: 256, mode: 'CTR' }`).

Similarly the default ECC algorithm is `prime256v1` (`{ curve: 'p256' }`).

Many algorithms required keys/buffers of fixed size. However there is no enforcement by this library that the provided values meet that size. The general approach is to hash the input, then adjust the bytes to fix. Buffers that are too small have `0` prepended, and similarly when too large are stripped from their beginning to match the desired size.

It is important to note that encryption _IS NOT_ the same as compression. In fact encryption methods will generally be slightly larger than the original input.

Ideally any cryptographic output should have statistically uniform distribution of their outputs. That means every byte in the output is equally likely to be `00` as it is `FF`, and everything in between.

As such, if you intend to combine encryption with compression, it is important to apply compression _before_ encryption, to take advantage of repeated and common patterns in the input.

Many methods in this module deal with "private" or "secret" values. Proper handling of those values are not explicitly covered by this module. Make sure you understand how to securely transfer and access these values before deploying encryption in production, as improper handling and data leaks can effectively render even the most secure encryption algorithms moot.

<a name="Implementation Details"></a>
## Implementation Details

These are far from thorough explanations of cryptographic functions, but hopefully serve as enough to justify design decisions and explain method interfaces.

### Hashing

Hashing algorithms are a "one way" programs, that output a fixed-size buffer that is effectively random for a given input. Re-hashing the same input with the algorithm _always_ returns the same output, but given the output it is virtually impossible to guess a valid input. Similarly it is virtually impossible to "guess" the output without fully applying the algorithm.

### Symmetric Encryption

Symmetric encryption algorithms take a message (a.k.a. `data`) and a "key" (a.k.a. `secret`) and produce a seemingly random output that represents that message. This output is effectively safe to expose publicly, as the original message is cryptographically hidden.

The same key (this is what makes it "symmetric") can then be used decrypt the output and retrieve the original message.

The key length is specified by the algorithm (e.g. `aes-256-ctr` requires 32 bytes), which may not necessarily match the actual length of the secret provided. Similarly the provided secret may not have "uniform distribution" of bytes (e.g. `Password123` only has bytes between `30`-`7A`). To mediate, the secret is hashed, and has bytes prepended/removed from the beginning of the buffer to match.

These algorithms also require an effectively random "Initialization Vector" (a.k.a. `iv`). This buffer is not necessarily private, it just cannot be known ahead of time, and should never be reused. Encryption methods in `iso-crypto` will generate this `iv` internally from a random number generator (see `randomBytes`) and exposed in the output alongside the encrypted data.

Given that the same secret it used to both encrypt and decrypt a message, it is not appropriate for sending messages between multiple parties. Instead, it should be used only in cases where the data is being stored/transferred by an untrusted third party and then re-read by original party (e.g. storing sensitive files on a third party server).

### Asymmetric Encryption

Asymmetric encryption differs from Symmetric encryption in regards to the "secret". In Asymmetric encryption, messages are secured with both a private key (known only to one party, treated as secret) and a public key (derived from a private key. Safe, if not encouraged, to share publicly).

#### ECDH

Presently, the only form of asymmetric encryption implemented by this module is Elliptic Curve Diffie-Hellman (ECDH).

##### How ECC works

Without going into extreme details of curve mathematics, the algorithm is based on points on curve. "Adding" (for simplicity, traditional mathematical terms/symbols are used, but the logic itself is _not_ as trivial as traditional addition) points on a curve is a straightforward equation. "Multiplying" a point can only be achieved by adding the original point N times, which can be simplified into binary logic (doubling + adding). These new points also lie on the curve (and are therefore verifiable).

For example `P1 * 10` can be simplified as `P1 * ((8 * 1) + (4 * 0) + (2 * 1) + (1 * 0))` -> `P1 * 8 + P1 * 2`. Note that `P1 * 2` can be rewritten as `P1 + P1` (straightforward) and `P1 * 4` can be rewritten as `P2 = P1 * 2; P2 * 2` (re-using a cached value). As such, multiplying a Point can be solved in `O(log(n))` time (multiplying by 2^256 takes ~ 256 "steps") which is very acceptable.

Given the complication of multiplication, there is no known "division" operator in ECC. As such, an algorithm can agree on an original point on a curve. Then the "private key" is simply a random number between the curves "domain" (`prime256v1` domain is between 0 and 2^256). The "public key" is the resulting point on the curve after multiplication.

A public key technically represents a point (both X and Y coordinates). However, since the equation for the curve is known, it is possible to provide _only_ the X coordinate, and a single byte indicating whether the associated Y coordinate is odd or even. This is known as the "compressed" form of a public key.

Given one parties public key (a point), and another's private key (an integer), these can _again_ be multiplied to produce a "shared secret". Due to the communicative properties of addition/multiplication, both combinations of PublicA * PrivateB AND PrivateA * PublicB produces the _same_ shared secret.

#### Implementation

This module focuses on the point mathematics required by ECC (relying on native modules as much as possible). Once a shared secret can be calculated, encryption is performed by the symmetric encryption algorithms provided by this module.

Since the secret is determined by the private key + public key combination, it can be used directly without any need for hashing. As such, no hash algorithm is used with ECC encryption.

Any public keys returned by this module will use the compressed form of a public key by default, however both forms are accepted as input.

<a name="Api"></a>
## API

### Types

#### InputType

Type used to represent allowed text/data input.

`string | Uint8Array | { text: string; encoding: string }`.

To verify the "buffer" input, pass the text to `decode` (which is done internally).

A plain string is inferred to be `UTF8` encoded.

### Hash

Type used to represent a specific hash algorithm.

`{ algorithm: string; size: number } | 'raw'`.

To avoid hashing (as it is sometimes used internally by algorithms) provide the `'raw'` option to return the input unchanged.

Generally defaults to `{ cipher: 'AES', size: 256, mode: 'CTR' }`.

### Encryption

Type used to represent a specific symmetric encryption algorithm.

`{ cipher: string; size: number; mode: string }`.

### Curve

Type used to represent a specific ECC curve. `string`.

Generally defaults to `p256`.

### randomBytes(size: number)

Produces a promise of Uint8Array of length `size` filled with random bytes.

### decode(input: InputText)

Decodes any input as Uint8Array, given the provided encoding (see `InputText`).

### encode(input: InputText, outputEncoding?: string)

Encodes any input (ideally as Uint8Array, but potentially as a differently encoded text) as the desired encoding.

Defaults to `UTF8`.

### decodeObject(input: Record<string, string>)

Decodes each attribute in an object to `Uint8Array`. Convenience method around manually calling `decode` for each attribute.

Potentially useful for converting serialized text (e.g. JSON containing hex-decoded data) to usable buffers.

### encodeObject(input: Record<string, Uint8Array>)

Encodes each attribute in an object to string. Convenience method around manually calling `encode` for each attribute.

Potentially useful for serializing decoded text (JSON does not like raw Uint8Array).

### hash(input: InputText, algorithm?: Algorithm)

Asynchronously hashes the input, and returns the output buffer. Defaults to `SHA256` algorithm.

### encrypt(params: { data: InputText; secret: InputText }, options?: { hash?: Hash; encryption?: Encryption })

Asynchronously encrypts the input using the provided algorithms (defaults to `aes-256-ctr`). Hashes the secret internally with the provided hashing algorithm (defaults to `SHA256`).

Returns both the `encrypted` data as a Uint8Array, as well as the internally generated `iv`.

Both of these properties will need to be provided to the `decrypt` method in order to decrypt the original data.

### decrypt(params: { encrypted: InputText; iv: InputText; secret: InputText }, options?: { hash?: Hash; encryption?: Encryption })

Asynchronously decrypts the data using the provided algorithms. Make sure that these are the _same_ algorithms used to encrypt the data originally.

Both the `encrypted` + `iv` comes from the output of `encrypt`, alongside the original `secret`.

### generateEccPrivateKey(curve?: Curve)

Asynchronously generates an ECC private key as a Uint8Array.

### generateEccPublicKey(privateKey: InputText, curve?: Curve)

Generates the corresponding public key for the provided private key.

### compressEccPublicKey(publicKey: InputText, curve?: Curve)

Calculates the corresponding compressed public key for the provided public key.

NOOP if public key is already compressed (idempotent).

Generally available for convenience. All public keys outputted by ecc methods are compressed by default, and accept both forms as input.

### decompressEccPublicKey(publicKey: InputText, curve?: Curve)

Calculate the corresponding uncompressed public key for the provided public key.

NOOP if public key is already uncompressed (idempotent).

### eccEncrypt(params: { data: InputText; privateKey: InputText; publicKey: InputText }, options?: { curve?: Curve; encryption?: Encryption })

Asynchronously determines the shared secret between public + private key, and encrypts the data using the specified encryption algorithm (defaults to `aes-256-ctr`).

Ensure that the keys are generated using the same curve algorithm provided.

Note that the `publicKey` should be the "_receiver's_" public key, not simply the public key for the provided `privateKey` ("_sender_").

Returns both the `encrypted` + `iv` data (see `encrypt`) as well as the `publicKey` corresponding to the input `privateKey` for convenience.

### eccDecrypt(params: { encrypted: InputText; iv: InputText; privateKey: InputText; publicKey: InputText }, options?: { curve?: Curve; encryption?: Encryption })

Asynchronously decrypts the data from `eccEncrypt` using the _receiver's_ `privateKey` and the _sender's_ `publicKey`.

Ensure that the provided curve + encryption algorithm is the same as used to encrypt.

---
"iso-crypto": minor
---

Add AES-GCM (`{ mode: 'GCM' }`), which detects tampering: `decrypt` rejects altered content or the wrong secret. Node.js and browser output interoperate, with the authentication tag appended to the encrypted content as Web Crypto does. GCM never pads a short key with zeros, as CBC and CTR do: a `'raw'` secret must be exactly the key size, and a hash at least that long, or `encrypt` and `decrypt` throw a `RangeError`. `eccEncrypt` and `eccDecrypt` with GCM derive the AES key from the ECDH shared secret with HKDF-SHA256, rather than using the shared secret directly as CBC and CTR do.

Add `deriveKey`, for PBKDF2 (passwords, 600,000 iterations by default) and HKDF (high-entropy secrets) key derivation.

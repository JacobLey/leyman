---
"iso-crypto": minor
---

Add an `additionalData` option to `encrypt`, `decrypt`, `eccEncrypt` and `eccDecrypt` for AES-GCM: data that is authenticated but not encrypted, so decryption rejects unless given the same value (e.g. binding a ciphertext to a record ID). Other modes throw a `TypeError` rather than ignore it.

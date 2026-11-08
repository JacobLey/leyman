---
'iso-crypto': patch
---

The browser implementation derives ECC public keys about 10× faster (P-521: from about 63 ms to 5.5 ms, on every `eccEncrypt`, `eccDecrypt` and `generateEccPublicKey`), with a Montgomery ladder in Jacobian coordinates that needs one modular inverse instead of one per point operation. Its steps no longer follow the private key's bits, as double-and-add's did, which narrows a timing side channel; BigInt arithmetic isn't constant-time, so it doesn't close it.

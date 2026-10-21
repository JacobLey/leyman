---
"iso-crypto": patch
---

`decompressEccPublicKey` (and so `eccEncrypt`/`eccDecrypt` in the browser) throws "Public key is not a point on the curve" for a compressed public key whose x coordinate has no point on the curve. It used to loop forever, so an untrusted public key could hang the page. Compressed keys with the wrong length or prefix are rejected too.

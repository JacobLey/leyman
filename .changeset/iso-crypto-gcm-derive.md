---
"iso-crypto": minor
---

Add AES-GCM (`{ mode: 'GCM' }`), which detects tampering: `decrypt` rejects altered content or the wrong secret. Node.js and browser output interoperate, with the authentication tag appended to the encrypted content as Web Crypto does.

Add `deriveKey`, for PBKDF2 (passwords, 600,000 iterations by default) and HKDF (high-entropy secrets) key derivation.

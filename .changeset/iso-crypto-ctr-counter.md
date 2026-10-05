---
"iso-crypto": patch
---

Browser AES-128 and AES-192 CTR now increment the full 128 bit counter block, matching Node.js. Previously only the low 64 or 96 bits incremented, so in the rare case those bits overflowed mid-message the output differed from (and could not be decrypted by) Node.js.

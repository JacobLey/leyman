---
"iso-crypto": patch
---

Deprecate 192-bit AES keys (`Sizes.KEY_192`), which Chromium-based browsers do not support. They still work for CBC and CTR on Node.js, Firefox and Safari, so existing data stays readable. AES-GCM only accepts 128 or 256 bit keys.

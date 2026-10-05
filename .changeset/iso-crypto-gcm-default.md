---
"iso-crypto": major
---

The default encryption for `encrypt`, `decrypt`, `eccEncrypt` and `eccDecrypt` is AES-256-GCM, which detects tampering, instead of AES-256-CTR. Data encrypted with the old default no longer decrypts with the default (it rejects rather than returning garbage). Pass the new `unsafeLegacyEncryption` export, the old default, as the `encryption` option to read it. Data encrypted with an explicit `encryption` option is unaffected.

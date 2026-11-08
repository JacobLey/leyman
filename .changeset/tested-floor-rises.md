---
"@leyman/expect": patch
"constant-consistent-hash": patch
"weighted-rendezvous-hash": patch
"default-import": patch
"entry-script": patch
"enum-to-array": patch
"find-import": patch
"iso-crypto": patch
"lease-cache": patch
"normalized-react-query": patch
"parse-cwd": patch
"pg-dolly": patch
"punycode-esm": patch
"static-emitter": patch
"test-chain-core": patch
"unknown-error": patch
---

Require Node.js 22.12.0 or later (`engines.node` was `>=22`). 22.12.0 is the oldest Node.js where the test runner starts, since mocha needs `require()` of ES modules, so it is the oldest version the package is tested on. Nothing changed for Node.js 22.12 and later.

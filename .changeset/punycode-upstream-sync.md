---
"punycode-esm": minor
---

Sync with upstream punycode.js v2.3.1: do not encode U+007F DEL, do not decode non-alphanumeric ASCII in Punycode labels, and throw `Invalid input` (rather than overflow) for invalid digits. Add Credit section to README.

---
"@leyman/eslint-config": patch
---

eslint-plugin-n's rules (`n/no-unsupported-features/*`...) check against the same Node.js floor as the rest of the config. For a package without `engines`, that is the running Node.js and newer, where eslint-plugin-n fell back to Node.js 16 and reported APIs the package can use.

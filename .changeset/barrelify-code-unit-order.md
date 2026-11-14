---
"barrelify": patch
---

Sort barrel exports and the list of changed barrels by UTF-16 code unit (`Zeta.js` before `alpha.js`, `a-b.js` before `a_b.js`). Exports were sorted by English collation, which depends on the ICU data Node ships with, and the changed barrels came back in the order the filesystem listed them. Both are now the same on every machine. A barrel whose names sort differently under the two orders is rewritten on the next run.

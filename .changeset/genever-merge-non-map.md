---
'genever': patch
---

A merge key of anything but maps (`<<: 1`) throws a `YAMLError` at its position, as documented, rather than a plain `Error`

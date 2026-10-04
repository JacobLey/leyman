---
"barrelify": minor
---

Re-export `.tsx` files (as `./Component.js`) and manage `index.tsx` barrels. Declaration files (`.d.ts`) are no longer re-exported, which produced unresolvable `./foo.d.js` imports.

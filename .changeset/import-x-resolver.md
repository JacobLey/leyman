---
"@leyman/eslint-config": minor
---

import-x now resolves imports with its own resolver, and follows TypeScript sources: `./file.js` finds `./file.ts`, as TypeScript's `nodenext` resolution does. It no longer loads the optional peer `eslint-import-resolver-node`, so `import-x/no-cycle` no longer crashes where that isn't installed (`autoInstallPeers: false`). Rules that resolve imports, such as `import-x/no-cycle` and `import-x/no-relative-parent-imports`, now check TypeScript imports they used to skip, so they may report errors that were there all along.

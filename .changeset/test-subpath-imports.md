---
"@leyman/configs": minor
---

`tsconfig.test.json` sets `rootDir` to the test folder and `outDir` to the `dist-test/` folder beside it, so a subpath import of compiled tests (`"#test/*": "./dist-test/*"`) type-checks against the test sources. Tests still emit nothing.

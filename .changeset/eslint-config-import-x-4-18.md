---
"@leyman/eslint-config": patch
---

Leave off the rules eslint-plugin-import-x 4.18 adds that contradict the config: `avoid-namespace-import` (namespace imports are allowed), and `avoid-barrel-files`, `avoid-importing-barrel-files` and `avoid-re-export-all` (a package's entry point is a barrel of its API). Before this, 4.18 turned them on as errors.

The plugins, `@eslint/js` and typescript-eslint now take `~` ranges, so a plugin's new rules only reach you with a release of this package.

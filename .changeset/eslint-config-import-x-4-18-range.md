---
"@leyman/eslint-config": patch
---

Require eslint-plugin-import-x `~4.18.0`, which accepts minimatch 11 (with its pattern amplification fix) where 4.17 needed minimatch 10. The four rules 4.18 added that contradict the config (`avoid-barrel-files`, `avoid-importing-barrel-files`, `avoid-namespace-import` and `avoid-re-export-all`) stay off.

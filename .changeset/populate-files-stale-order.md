---
"populate-files": patch
---

`clean` removes and reports stale files sorted by path (in UTF-16 code unit order), and checks that they are unedited in that order, as the Go implementation does. They came in the order the file system listed them, or the manifest held them, so which edited file was refused first could vary. A manifest listing one file by two paths (like `a.json` and `./a.json`) throws `GeneratedSignatureManifestError`, naming both, rather than using whichever came last.

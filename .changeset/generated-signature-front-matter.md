---
"generated-signature": patch
---

`sign()` inserts the signature line after Markdown front matter (a leading `---` block, in files with `<!-- -->` comments), instead of above it, which stopped the front matter being read.

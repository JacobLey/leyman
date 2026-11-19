---
"xenever": patch
---

Elements nested deeper than 256 are now caught by parse-xml's own depth limit instead of a separate scan of the document. The `XeneverXmlError` keeps its message and location, now has parse-xml's error as its `cause`, and a document with an earlier well-formedness error reports that one first.

---
"xenever": patch
---

Update dependencies: @rgrove/parse-xml@5.2.0. An XML declaration with no whitespace before `standalone`, or with an empty or incomplete `encoding` or `standalone`, is now a `XeneverXmlError`, as XML 1.0 requires, and text with many carriage returns no longer parses in quadratic time.

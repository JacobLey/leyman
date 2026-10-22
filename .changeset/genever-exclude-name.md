---
"genever": patch
---

Name a schema called `Exclude` `Exclude2`, as is done for `Record`, so it doesn't shadow the global type the OpenAPI operation helpers use. The generated file failed to compile with "Type 'Exclude' is not generic".

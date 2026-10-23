---
"juniper": patch
---

An empty `title`, `description`, `format`, `contentEncoding` or `contentMediaType` is kept in the generated schema, as is an empty `id` passed to `toJSON()`, rather than dropped. `null` is what removes one.

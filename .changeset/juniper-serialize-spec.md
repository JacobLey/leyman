---
"juniper": minor
---

New `serializeSpec(spec, options?)` serializes every Juniper schema in an OpenAPI document and fills `components.schemas` with every definition they use, so no schema has to be listed for `components()`. The dialect follows the document's `openapi` version.

---
"juniper": patch
---

Serializing a schema serializes each definition (`.define()`) once, rather than once per path to it. Definitions nested in definitions doubled the time for each level, and more when shared: ten levels of definitions that each use the one below twice took seconds to serialize, and now take under a millisecond. The output is unchanged.

---
'genever': patch
---

Generating from large schemas is about a fifth faster: genever no longer builds a JSON Pointer for every keyword a schema doesn't have while indexing it, nor serializes a type to compare it when it is the only member of a union or intersection. A schema with 200,000 properties went from 1.3 s to 1.0 s.

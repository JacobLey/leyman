---
'haywire': patch
---

Type-check a `ContainerFactory`'s list `bindInstance` calls in constant time. Each one used to roughly triple the type-check, and on a module of 100 bindings three of them ran TypeScript out of memory. `CombineListOutputs` no longer adds a member per pair of different outputs, and `ContainerFactory` carries list outputs in their own type parameter, in place of the union of instance bindings. Which calls compile is unchanged.

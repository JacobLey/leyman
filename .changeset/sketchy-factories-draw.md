---
"haywire": minor
---

`ContainerFactory` has `describe()` and `toMermaid()`, describing the containers it creates. Ids still to be bound with `bindInstance()` are marked `unbound` in the description (a new `BindingDescription` property), and drawn with a dashed border labelled `bindInstance()`.

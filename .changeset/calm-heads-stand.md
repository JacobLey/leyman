---
"xenever": minor
---

Support substitution groups and abstract elements. `loadXsd` and the CLI turn a reference to the head of a substitution group into a choice of the head and the members that may stand for it, honouring `abstract`, `block` and `final`, instead of throwing `XeneverUnsupportedError`. Each member keeps its own key in `children`. An element declaration takes a new `abstract` option: such an element is an error as the root and matches nothing in a content model, and its value's type is `never`. A reference inside `xs:all` to a head with members is still unsupported.

---
"haywire": minor
---

Add `module.replaceBinding(binding)` to swap a binding for another, such as a fake in tests. It is type-checked like `addBinding`: a binding for the id must already exist, the replacement must still satisfy everything that depends on it, and its own dependencies must be provided by the module. For a list, it replaces every binding of that list.

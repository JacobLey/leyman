---
"haywire": minor
---

Make containers easier to debug.

- Missing provider errors name the bindings that need each missing id: `Providers missing for container: DB_URL (needed by Database, MigrationRunner)`.
- Sync supplier errors name the binding that declares the supplier, and the chain of dependencies down to the async binding: `needed by: Handler, async: Repository->Database`.
- `container.describe()` returns every binding with its scope, whether it is async, and its dependencies with the bindings that provide them. `container.toMermaid()` renders the same graph as a Mermaid flowchart. Neither checks the container, so both work on one that fails `check()`. The `ContainerDescription` and `BindingDescription` types are exported.

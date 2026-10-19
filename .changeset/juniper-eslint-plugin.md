---
"juniper": minor
---

New `juniper/eslint` entry point with a `juniper/top-level-schema` rule, reporting schemas built inside functions or class instance fields instead of once at module scope. `eslint` is an optional peer dependency, and importing `juniper` never loads the plugin.

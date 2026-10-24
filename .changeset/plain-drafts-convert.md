---
"juniper": minor
---

Support the `draft-07` target of Standard JSON Schema (`schema['~standard'].jsonSchema.input({ target: 'draft-07' })`), which libraries such as the AI SDK, Mastra and TanStack AI request for tool schemas. Keywords are rewritten to their exact draft-07 forms, and a schema with none (such as one using `maxContains`) throws.

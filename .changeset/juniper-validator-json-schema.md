---
"juniper-validator": minor
---

Implement Standard JSON Schema on validators, so libraries that need both a JSON Schema and a validator can take one object. `validator['~standard'].jsonSchema` is the Juniper schema's, or, for a validator made from a rendered JSON Schema object, returns that object for the `draft-2020-12` target.

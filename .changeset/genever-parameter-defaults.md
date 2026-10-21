---
"genever": minor
---

`--parameter-defaults` (`parameterDefaults: true`) also writes `OperationRequest<Id>`, a server handler's view of an operation: as `OperationInput`, but a parameter whose schema has a `default` is required, as a validator that fills in defaults always sets it.

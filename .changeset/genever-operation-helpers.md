---
"genever": minor
---

A document with operations also gets `OperationInput<Id>` and `OperationResult<Id>`, keyed by `operationId`: what a call to the operation sends (parameters by location, and the JSON body, each only if it has them), and every response it documents as `{ status, body }`, so checking `status` narrows `body`.

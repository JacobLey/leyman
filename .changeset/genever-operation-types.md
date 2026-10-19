---
"genever": minor
---

An OpenAPI document with `paths` also generates `Paths` (by path, then method) and `Operations` (by `operationId`) types, in the shape openapi-typescript generates: each operation's `parameters` by location, `requestBody`, and `responses` by status code with `headers` and `content` by media type. `$ref`s to parameters, request bodies, responses, headers and path items are followed.

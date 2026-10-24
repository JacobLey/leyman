---
"genever": minor
---

Generate types for OpenAPI documents split across files. A path item, parameter, request body, response or header may be a `$ref` to another file (`./paths/pets.yaml`, `./responses.yaml#/NotFound`), and a schema may refer into another OpenAPI document (`./common.yaml#/components/schemas/Error`), whose schemas keep its own OpenAPI version. Only the schemas used from another document become types. An error in another file has a `pointer` that starts with the file's URI.

# e2e-juniper-openapi

Builds an example users and posts OpenAPI spec with [`juniper`](../../apps/juniper), and checks it is valid OpenAPI 3.0 and 3.1. Juniper builds every schema, and [`openapi3-ts`](https://www.npmjs.com/package/openapi3-ts) the paths, parameters and security schemes. It doubles as a check that juniper is pleasant to use for a real API.

The tests check that:

- the spec is valid OpenAPI 3.0 and 3.1, with every `$ref` resolving ([`@apidevtools/swagger-parser`](https://www.npmjs.com/package/@apidevtools/swagger-parser))
- shared schemas are emitted once in `components.schemas`, via juniper's `define()` and `components()`, including recursive comment threads (`defineRecursive()`)
- request and response types inferred from the schemas match the API's TypeScript types
- example payloads validate with [`juniper-validator`](../../apps/juniper-validator)

It is not published, and has no source of its own: only tests.

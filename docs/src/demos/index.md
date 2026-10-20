---
description: Worked examples of using open-source projects and services well, each a fully tested package run against real services.
---

# Demos

Worked examples of putting open-source projects and services together well. Each demo is a small package in [`demos/`](https://github.com/JacobLey/leyman/tree/main/demos), never published: the point is the implementation, not an API to install.

Each one is held to the same bar as the published packages, so the code can be copied with confidence:

- **Tested against real services**, never mocks: the same Valkey (or Postgres) image runs as a devcontainer sidecar and as a service in CI.
- **100% coverage**, type-checked and linted.
- **Every feature behind an option**, composed from [haywire](/haywire/) bindings, so each one's effect (and cost) is tested on its own.
- **Written up as what it is, and why**: what each library does and doesn't do, the gaps found, and what was learned building it.

| Demo | What it shows |
|------|---------------|
| [Read-through cache](/demos/read-through-cache) | BentoCache on Valkey: a memory tier kept in sync, stale-while-revalidate, one load per key across instances with [lease-cache](/lease-cache/), and sharding over several nodes with weighted rendezvous hashing. |
| [OpenAPI](/demos/openapi) | A notes API from spec to database: an OpenAPI 3.1 document built from [Juniper](/juniper/) schemas, [genever](/genever/) types for a typed client and a Hono server that validates every request and response, and Drizzle on Postgres with a [pg-dolly](/pg-dolly/) database per test. |

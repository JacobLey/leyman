---
layout: home
hero:
  name: Leyman
  tagline: TypeScript libraries and tools for Node.js ESM environments.
  actions:
    - theme: alt
      text: Demos
      link: /demos/
features:
  - title: Juniper
    details: Build JSON Schemas in TypeScript with inferred static types — strict, Ajv-ready, JSON Schema 2020-12 and OpenAPI 3.0 output.
    link: /juniper/
  - title: Juniper Validator
    details: Standard Schema compliant validators for Juniper schemas, with type guards and assertions.
    link: /juniper-validator/
  - title: genever
    details: Generate TypeScript types from JSON Schema files and OpenAPI documents, with strict schema checks and the same types Juniper infers.
    link: /genever/
  - title: Haywire
    details: Compile-time checked dependency injection for TypeScript — no decorators, no reflect-metadata, no global state.
    link: /haywire/
  - title: haywire-launcher
    details: Run a Haywire-built entry script in one line, building the container only when the script runs.
    link: /haywire-launcher/
  - title: entry-script
    details: Node.js scripts whose main() only runs when they are the entry point, so tests can import them without side effects.
    link: /entry-script/
  - title: nx-lifecycle
    details: Nx plugin that derives every dependsOn from declared lifecycle stages (build, test, …) and the targets bound to them.
    link: /nx-lifecycle/
  - title: Barrelify
    details: Generate and CI-verify TypeScript barrel (index.ts) files with the correct ESM/CJS import extensions.
    link: /barrelify/
  - title: populate-files
    details: Write generated files from code, and fail CI when they are out of date or were edited by hand, with editable manual sections.
    link: /populate-files/
  - title: generated-signature
    details: Sign generated files so hand edits are detected by an ESLint rule or a single function call, while manual sections stay editable.
    link: /generated-signature/
  - title: normalized-react-query
    details: Type-safe TanStack Query definitions that pair each key with its fetcher, and link related queries so they load together, including for server rendering.
    link: /normalized-react-query/
  - title: mocha-chain
    details: Chain Mocha hooks so each passes typed context to the next, instead of sharing nullable variables between hooks and tests.
    link: /mocha-chain/
  - title: vitest-chain
    details: The same hook chaining for Vitest, with typed context alongside Vitest's own test context.
    link: /vitest-chain/
  - title: lease-cache
    details: Read-through caching on Valkey or Redis with leases, so each miss is loaded once across every instance, and a load that finishes after an invalidation never caches its outdated value.
    link: /lease-cache/
  - title: Demos
    details: Worked examples of open-source projects and services put together well, each fully tested against real services. Starting with a read-through cache on Valkey.
    link: /demos/
  - title: unknown-error
    details: Turn any caught unknown into a real Error without throwing, even for hostile values, other realms and deep or circular cause chains.
    link: /unknown-error/
---

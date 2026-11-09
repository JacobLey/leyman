/**
 * Every documented package and demo, once. The nav, sidebars, home page, package list and
 * cross-links are all built from this, so adding a package or demo means adding an entry here
 * (plus its pages).
 *
 * Plain data, imported by both `config.ts` (Node) and the theme (browser). Facts read from disk,
 * such as npm names, are added by `config.ts`.
 */

/**
 * A page of a package or demo, relative to its root (`''` is the overview), or a group of pages.
 */
export type Page =
    | { readonly text: string; readonly link: string }
    | { readonly text: string; readonly items: readonly Page[] };

export const categories = [
    'Schemas and types',
    'Dependency injection and scripts',
    'Testing',
    'Generated files and monorepo tooling',
    'Data and caching',
    'Errors',
] as const;
export type Category = (typeof categories)[number];

export interface Package {
    /**
     * URL segment: pages live in `src/packages/<slug>/`.
     */
    readonly slug: string;
    readonly title: string;
    readonly category: Category;
    /**
     * One line, shown on cards and lists.
     */
    readonly pitch: string;
    /**
     * Repo paths of the npm packages these pages document (usually one). Each has a
     * `package.json` and a `CHANGELOG.md`.
     */
    readonly sources: readonly string[];
    /**
     * Slugs of related packages. Declared on one side, shown on both.
     */
    readonly related?: readonly string[];
    readonly pages: readonly Page[];
}

export interface Demo {
    /**
     * URL segment: pages live in `src/demos/<slug>/`.
     */
    readonly slug: string;
    readonly title: string;
    readonly pitch: string;
    /**
     * Repo path of the demo.
     */
    readonly source: string;
    /**
     * Repo paths (files or directories) of the working code worth jumping to: tests, setup, entry
     * points. The build fails if one doesn't exist.
     */
    readonly files: readonly { readonly label: string; readonly path: string }[];
    /**
     * Slugs of the packages it uses.
     */
    readonly uses: readonly string[];
    /**
     * Slugs of related demos. Declared on one side, shown on both.
     */
    readonly related?: readonly string[];
    readonly pages: readonly Page[];
}

/**
 * Links to GitHub and npm, worked out by `config.ts` from the registry and the files on disk, and
 * passed to the theme as `themeConfig.links`.
 */
export interface Links {
    readonly packages: Readonly<
        Record<
            string,
            readonly {
                readonly name: string;
                readonly npm: string;
                readonly source: string;
                readonly changelog: string;
            }[]
        >
    >;
    readonly demos: Readonly<Record<string, ShowcaseLinks>>;
    readonly infrastructure: Readonly<Record<string, ShowcaseLinks>>;
}

/**
 * GitHub links of a demo or an infrastructure entry: its source, and its `files`.
 */
export interface ShowcaseLinks {
    readonly source: string;
    readonly files: readonly { readonly label: string; readonly url: string }[];
}

export const packages: readonly Package[] = [
    {
        slug: 'juniper',
        title: 'Juniper',
        category: 'Schemas and types',
        pitch: "A JSON Schema builder for TypeScript that infers each schema's type and catches schema mistakes at compile time, with JSON Schema 2020-12 and OpenAPI 3.0 output.",
        sources: ['apps/juniper'],
        related: ['juniper-validator', 'genever'],
        pages: [
            { text: 'Overview', link: '' },
            { text: 'Getting started', link: 'getting-started' },
            {
                text: 'Guides',
                items: [
                    { text: 'Reusing schemas', link: 'guides/reusing-schemas' },
                    { text: 'Deriving object schemas', link: 'guides/deriving-object-schemas' },
                    { text: 'OpenAPI', link: 'guides/openapi' },
                    { text: 'Recipes', link: 'guides/recipes' },
                    { text: 'ESLint', link: 'guides/eslint' },
                ],
            },
            {
                text: 'Reference',
                items: [
                    { text: 'Schemas', link: 'reference/schemas' },
                    { text: 'API', link: 'reference/api' },
                ],
            },
            { text: 'Why Juniper', link: 'why' },
        ],
    },
    {
        slug: 'juniper-validator',
        title: 'Juniper Validator',
        category: 'Schemas and types',
        pitch: 'Standard Schema compliant validators for Juniper schemas, with type guards and assertions.',
        sources: ['apps/juniper-validator'],
        pages: [
            { text: 'Overview', link: '' },
            { text: 'Getting started', link: 'getting-started' },
            {
                text: 'Guides',
                items: [{ text: 'Standard Schema', link: 'guides/standard-schema' }],
            },
            { text: 'Reference', items: [{ text: 'API', link: 'reference/api' }] },
        ],
    },
    {
        slug: 'juniper-arbitrary',
        title: 'Juniper Arbitrary',
        category: 'Schemas and types',
        pitch: 'fast-check arbitraries from Juniper schemas, for property-based tests with typed values that always validate.',
        sources: ['apps/juniper-arbitrary'],
        related: ['juniper', 'juniper-validator'],
        pages: [
            { text: 'Overview', link: '' },
            { text: 'Getting started', link: 'getting-started' },
            {
                text: 'Guides',
                items: [
                    { text: 'How values are generated', link: 'guides/how-values-are-generated' },
                ],
            },
            { text: 'Reference', items: [{ text: 'API', link: 'reference/api' }] },
        ],
    },
    {
        slug: 'genever',
        title: 'genever',
        category: 'Schemas and types',
        pitch: 'Generate TypeScript types from JSON Schema files and OpenAPI documents, with strict schema checks and the same types Juniper infers.',
        sources: ['apps/genever/ts'],
        related: ['populate-files', 'generated-signature'],
        pages: [
            { text: 'Overview', link: '' },
            { text: 'Getting started', link: 'getting-started' },
            {
                text: 'Guides',
                items: [
                    { text: 'Strict mode', link: 'guides/strict-mode' },
                    { text: 'OpenAPI documents', link: 'guides/openapi' },
                    { text: 'References to other files', link: 'guides/references' },
                    { text: 'Juniper round trip', link: 'guides/juniper-round-trip' },
                    { text: 'Go', link: 'guides/go' },
                ],
            },
            {
                text: 'Reference',
                items: [
                    { text: 'Type mapping', link: 'reference/types' },
                    { text: 'API and CLI', link: 'reference/api' },
                ],
            },
            { text: 'Why genever', link: 'why' },
            { text: 'Comparison', link: 'comparison' },
            { text: 'Go comparison', link: 'go-comparison' },
        ],
    },
    {
        slug: 'haywire',
        title: 'Haywire',
        category: 'Dependency injection and scripts',
        pitch: 'Dependency injection for TypeScript that checks the wiring at compile time, without decorators or reflect-metadata.',
        sources: ['tools/haywire'],
        related: ['haywire-launcher'],
        pages: [
            { text: 'Overview', link: '' },
            { text: 'Getting started', link: 'getting-started' },
            {
                text: 'Guides',
                items: [
                    { text: 'Scopes', link: 'guides/scopes' },
                    { text: 'Suppliers', link: 'guides/suppliers' },
                    { text: 'Circular dependencies', link: 'guides/circular-dependencies' },
                    { text: 'Lists', link: 'guides/lists' },
                    { text: 'Runtime values', link: 'guides/runtime-values' },
                    { text: 'Disposal', link: 'guides/disposal' },
                    { text: 'Testing', link: 'guides/testing' },
                    { text: 'Debugging', link: 'guides/debugging' },
                    { text: 'Web frameworks', link: 'guides/frameworks' },
                    { text: 'Migrating', link: 'guides/migrating' },
                ],
            },
            { text: 'Reference', items: [{ text: 'API', link: 'reference/api' }] },
            { text: 'Upgrading to 2.0', link: 'upgrading' },
            { text: 'Why Haywire', link: 'why' },
        ],
    },
    {
        slug: 'haywire-launcher',
        title: 'haywire-launcher',
        category: 'Dependency injection and scripts',
        pitch: 'Run a Haywire-built entry script in one line, building the container only when the script runs.',
        sources: ['tools/haywire-launcher'],
        related: ['entry-script'],
        pages: [
            { text: 'Overview', link: '' },
            { text: 'Getting started', link: 'getting-started' },
            { text: 'Reference', items: [{ text: 'API', link: 'reference/api' }] },
        ],
    },
    {
        slug: 'entry-script',
        title: 'entry-script',
        category: 'Dependency injection and scripts',
        pitch: 'Node.js scripts whose main() only runs when they are the entry point, so tests can import them without side effects.',
        sources: ['tools/entry-script'],
        pages: [
            { text: 'Overview', link: '' },
            { text: 'Getting started', link: 'getting-started' },
            { text: 'Reference', items: [{ text: 'API', link: 'reference/api' }] },
        ],
    },
    {
        slug: 'mocha-chain',
        title: 'mocha-chain',
        category: 'Testing',
        pitch: 'Chain Mocha hooks so each passes typed context to the next, instead of sharing nullable variables between hooks and tests.',
        sources: ['tools/test-chain/mocha-chain'],
        related: ['vitest-chain'],
        pages: [
            { text: 'Overview', link: '' },
            { text: 'Getting started', link: 'getting-started' },
            { text: 'Guides', items: [{ text: 'Chaining hooks', link: 'guides/chaining' }] },
            { text: 'Reference', items: [{ text: 'API', link: 'reference/api' }] },
            { text: 'Why mocha-chain', link: 'why' },
        ],
    },
    {
        slug: 'vitest-chain',
        title: 'vitest-chain',
        category: 'Testing',
        pitch: 'The same hook chaining for Vitest, with typed context alongside Vitest’s own test context.',
        sources: ['tools/test-chain/vitest-chain'],
        pages: [
            { text: 'Overview', link: '' },
            { text: 'Getting started', link: 'getting-started' },
            { text: 'Reference', items: [{ text: 'API', link: 'reference/api' }] },
        ],
    },
    {
        slug: 'pg-dolly',
        title: 'pg-dolly',
        category: 'Testing',
        pitch: 'A fresh Postgres database for every test, cloned from a template built once from your schema’s SQL, safe next to dev data and across parallel runs.',
        sources: ['tools/pg-dolly'],
        related: ['pg-dolly-schema', 'mocha-chain', 'vitest-chain'],
        pages: [
            { text: 'Overview', link: '' },
            { text: 'Getting started', link: 'getting-started' },
            {
                text: 'Guides',
                items: [
                    { text: 'Test runners', link: 'guides/test-runners' },
                    { text: 'The schema', link: 'guides/schema' },
                    { text: 'Deterministic tests', link: 'guides/deterministic-tests' },
                    { text: 'How it works', link: 'guides/how-it-works' },
                ],
            },
            { text: 'Reference', items: [{ text: 'API', link: 'reference/api' }] },
            { text: 'Why pg-dolly', link: 'why' },
        ],
    },
    {
        slug: 'pg-dolly-schema',
        title: 'pg-dolly-schema',
        category: 'Testing',
        pitch: 'Keep a schema.sql of what your Postgres migrations build, for any migration tool, and fail CI when it’s stale.',
        sources: ['apps/pg-dolly-schema'],
        related: ['populate-files'],
        pages: [
            { text: 'Overview', link: '' },
            { text: 'Getting started', link: 'getting-started' },
            { text: 'Reference', items: [{ text: 'API and CLI', link: 'reference/api' }] },
        ],
    },
    {
        slug: 'nx-lifecycle',
        title: 'nx-lifecycle',
        category: 'Generated files and monorepo tooling',
        pitch: 'Nx plugin that derives every dependsOn from declared lifecycle stages (build, test, …) and the targets bound to them.',
        sources: ['apps/nx-lifecycle'],
        related: ['populate-files'],
        pages: [
            { text: 'Overview', link: '' },
            { text: 'Getting started', link: 'getting-started' },
            {
                text: 'Guides',
                items: [
                    { text: 'Stages and hooks', link: 'guides/stages-and-hooks' },
                    { text: 'Overriding inferred targets', link: 'guides/overriding-targets' },
                    { text: 'Executor', link: 'guides/executor' },
                ],
            },
            {
                text: 'Reference',
                items: [
                    { text: 'Configuration', link: 'reference/configuration' },
                    { text: 'CLI', link: 'reference/cli' },
                ],
            },
            { text: 'Why nx-lifecycle', link: 'why' },
        ],
    },
    {
        slug: 'barrelify',
        title: 'Barrelify',
        category: 'Generated files and monorepo tooling',
        pitch: 'Generate and CI-verify TypeScript barrel (index.ts) files with the correct ESM/CJS import extensions.',
        sources: ['apps/barrelify'],
        related: ['populate-files'],
        pages: [
            { text: 'Overview', link: '' },
            { text: 'Getting started', link: 'getting-started' },
            { text: 'Guides', items: [{ text: 'Module systems', link: 'guides/module-systems' }] },
            { text: 'Reference', items: [{ text: 'API and CLI', link: 'reference/api' }] },
        ],
    },
    {
        slug: 'populate-files',
        title: 'populate-files',
        category: 'Generated files and monorepo tooling',
        pitch: 'Write generated files from code, and fail CI when they are out of date or were edited by hand, with editable manual sections.',
        sources: ['apps/populate-files/ts', 'apps/populate-files/load-populate-files'],
        related: ['generated-signature'],
        pages: [
            { text: 'Overview', link: '' },
            { text: 'Getting started', link: 'getting-started' },
            {
                text: 'Guides',
                items: [
                    { text: 'Config modules and the CLI', link: 'guides/config-modules' },
                    { text: 'Signed files', link: 'guides/signed-files' },
                    { text: 'Manifest', link: 'guides/manifest' },
                    { text: 'Go', link: 'guides/go' },
                ],
            },
            {
                text: 'Reference',
                items: [
                    { text: 'API', link: 'reference/api' },
                    { text: 'CLI', link: 'reference/cli' },
                ],
            },
        ],
    },
    {
        slug: 'generated-signature',
        title: 'generated-signature',
        category: 'Generated files and monorepo tooling',
        pitch: 'Sign generated files so hand edits are detected by an ESLint rule or a single function call, while manual sections stay editable.',
        sources: ['tools/generated-signature/ts'],
        pages: [
            { text: 'Overview', link: '' },
            { text: 'Getting started', link: 'getting-started' },
            {
                text: 'Guides',
                items: [
                    { text: 'ESLint', link: 'guides/eslint' },
                    { text: 'Go', link: 'guides/go' },
                ],
            },
            {
                text: 'Reference',
                items: [
                    { text: 'File format', link: 'reference/format' },
                    { text: 'API', link: 'reference/api' },
                ],
            },
        ],
    },
    {
        slug: 'lease-cache',
        title: 'lease-cache',
        category: 'Data and caching',
        pitch: 'A read-through cache for Valkey or Redis that shares one load per key across all your servers, and handles invalidating a key while it loads.',
        sources: ['tools/lease-cache'],
        pages: [
            { text: 'Overview', link: '' },
            { text: 'Getting started', link: 'getting-started' },
            {
                text: 'Guides',
                items: [
                    { text: 'Clients', link: 'guides/clients' },
                    { text: 'Invalidation', link: 'guides/invalidation' },
                ],
            },
            { text: 'Reference', items: [{ text: 'API', link: 'reference/api' }] },
            { text: 'Why lease-cache', link: 'why' },
        ],
    },
    {
        slug: 'idempotency-keys',
        title: 'idempotency-keys',
        category: 'Data and caching',
        pitch: 'Server-side support for the Idempotency-Key header, so clients can safely retry a POST. Works across instances, on Postgres or Valkey, in TypeScript and Go.',
        sources: ['tools/idempotency-keys/ts'],
        related: ['lease-cache'],
        pages: [
            { text: 'Overview', link: '' },
            { text: 'Getting started', link: 'getting-started' },
            {
                text: 'Guides',
                items: [
                    { text: 'Stores', link: 'guides/stores' },
                    { text: 'Notifiers', link: 'guides/notifiers' },
                    { text: 'Which responses are stored', link: 'guides/responses' },
                    { text: 'Keys, scope and operation', link: 'guides/identity' },
                    { text: 'Other frameworks', link: 'guides/other-frameworks' },
                    { text: 'Go', link: 'guides/go' },
                ],
            },
            {
                text: 'Reference',
                items: [
                    { text: 'API', link: 'reference/api' },
                    { text: 'Specification', link: 'reference/specification' },
                ],
            },
        ],
    },
    {
        slug: 'normalized-react-query',
        title: 'normalized-react-query',
        category: 'Data and caching',
        pitch: 'Type-safe TanStack Query definitions that pair each key with its fetcher, and link related queries so they load together, including for server rendering.',
        sources: ['tools/normalized-react-query'],
        pages: [
            { text: 'Overview', link: '' },
            { text: 'Getting started', link: 'getting-started' },
            {
                text: 'Guides',
                items: [
                    { text: 'Linked queries', link: 'guides/linked-queries' },
                    { text: 'Infinite queries', link: 'guides/infinite-queries' },
                    { text: 'Server rendering', link: 'guides/server-rendering' },
                ],
            },
            { text: 'Reference', items: [{ text: 'API', link: 'reference/api' }] },
            { text: 'Why normalized-react-query', link: 'why' },
        ],
    },
    {
        slug: 'unknown-error',
        title: 'unknown-error',
        category: 'Errors',
        pitch: 'Turn any caught unknown into a real Error without throwing, even for hostile values, other realms and deep or circular cause chains.',
        sources: ['tools/unknown-error'],
        pages: [
            { text: 'Overview', link: '' },
            { text: 'Getting started', link: 'getting-started' },
            {
                text: 'Guides',
                items: [
                    { text: 'Converting caught values', link: 'guides/converting' },
                    { text: 'Cause chains', link: 'guides/cause-chains' },
                ],
            },
            { text: 'Reference', items: [{ text: 'API', link: 'reference/api' }] },
            { text: 'Why unknown-error', link: 'why' },
        ],
    },
];

export const demos: readonly Demo[] = [
    {
        slug: 'blake3-wasm',
        title: 'BLAKE3 through WASM',
        pitch: 'BLAKE3 from Rust through WASM with SIMD, on Node.js and in browsers, blocking or in a worker, measured against the fastest JavaScript to find where WASM pays off.',
        source: 'demos/blake3-wasm',
        files: [
            { label: 'The crate', path: 'demos/blake3-wasm/rust/src/lib.rs' },
            { label: 'Loading in a browser', path: 'demos/blake3-wasm/typescript/src/browser.ts' },
            {
                label: 'The worker',
                path: 'demos/blake3-wasm/typescript/src/lib/hash-worker.ts',
            },
            {
                label: 'JavaScript baseline',
                path: 'demos/blake3-wasm/typescript/test/bench/tight-blake3.ts',
            },
            {
                label: 'Browser tests',
                path: 'demos/blake3-wasm/typescript/test/integration/browser.spec.ts',
            },
        ],
        uses: [],
        pages: [{ text: 'Overview', link: '' }],
    },
    {
        slug: 'blake3-go',
        title: 'BLAKE3 from Go through WASM',
        pitch: 'The same Rust crate called from Go without cgo, built to bare WASM behind a C ABI, run by wazero, and measured against BLAKE3 in Go and native Rust to find where it pays off.',
        source: 'demos/blake3-go',
        files: [
            { label: 'The C ABI', path: 'demos/blake3-go/rust/src/ffi.rs' },
            { label: 'Embedding the WASM', path: 'demos/blake3-go/rust/wasm.go' },
            { label: 'Calling it from Go', path: 'demos/blake3-go/go/blake3.go' },
            { label: 'The bench', path: 'demos/blake3-go/go/bench_test.go' },
        ],
        uses: [],
        related: ['blake3-wasm'],
        pages: [{ text: 'Overview', link: '' }],
    },
    {
        slug: 'read-through-cache',
        title: 'Read-through cache',
        pitch: 'A read-through cache built from BentoCache and lease-cache on Valkey, with a memory tier kept in sync, stale-while-revalidate, one load per key across instances, and sharding over several nodes with weighted rendezvous hashing.',
        source: 'demos/read-through-cache',
        files: [
            {
                label: 'Options and composition',
                path: 'demos/read-through-cache/src/lib/create.ts',
            },
            { label: 'Shared tier', path: 'demos/read-through-cache/src/lib/shared-tier.ts' },
            {
                label: 'Integration tests',
                path: 'demos/read-through-cache/test/integration/read-through-cache.spec.ts',
            },
            { label: 'Valkey sidecar', path: '.devcontainer/docker-compose.yml' },
            { label: 'Valkey in CI', path: 'dagger/main.go' },
        ],
        uses: ['lease-cache', 'haywire', 'mocha-chain'],
        pages: [{ text: 'Overview', link: '' }],
    },
    {
        slug: 'openapi',
        title: 'OpenAPI',
        pitch: 'A small notes API built properly from the spec down to the database, with an OpenAPI 3.1 document written with Juniper, genever types for a typed client and a Hono server that validates every request and response, and Drizzle on Postgres with a database per test.',
        source: 'demos/openapi',
        files: [
            { label: 'The spec', path: 'demos/openapi/spec/src/spec.ts' },
            { label: 'openapi.json', path: 'demos/openapi/spec/out/openapi.json' },
            { label: 'notes.openapi.yaml', path: 'demos/openapi/spec/out/notes.openapi.yaml' },
            { label: 'Content mapper config', path: 'demos/openapi/client/tsconfig.json' },
            { label: 'Migrations', path: 'demos/openapi/database/migrations' },
            { label: 'schema.sql', path: 'demos/openapi/database/schema.sql' },
            { label: 'Server composition', path: 'demos/openapi/server/src/lib/module.ts' },
            { label: 'Typed client', path: 'demos/openapi/client/src/lib/client.ts' },
            {
                label: 'Server integration tests',
                path: 'demos/openapi/server/test/integration/notes.spec.ts',
            },
            { label: 'Postgres sidecar', path: '.devcontainer/docker-compose.yml' },
            { label: 'Postgres in CI', path: 'dagger/main.go' },
        ],
        uses: [
            'juniper',
            'juniper-arbitrary',
            'genever',
            'populate-files',
            'pg-dolly',
            'pg-dolly-schema',
            'idempotency-keys',
            'haywire',
            'mocha-chain',
        ],
        pages: [{ text: 'Overview', link: '' }],
    },
    {
        slug: 'mcp-server',
        title: 'MCP server',
        pitch: 'An MCP server that makes the notes API easy for AI agents to use, with tools shaped around tasks, OAuth with step-up scopes, and token exchange so it calls the API as the agent’s user.',
        source: 'demos/agents/mcp',
        files: [
            { label: 'Tools', path: 'demos/agents/mcp/src/lib/tools.ts' },
            { label: 'Token exchange', path: 'demos/agents/mcp/src/lib/exchange.ts' },
            { label: 'Composition', path: 'demos/agents/mcp/src/lib/module.ts' },
            { label: 'The test stack', path: 'demos/agents/mcp/test/helpers/stack.ts' },
            { label: 'Tool tests', path: 'demos/agents/mcp/test/integration/tools.spec.ts' },
            {
                label: 'Authorization tests',
                path: 'demos/agents/mcp/test/integration/auth.spec.ts',
            },
        ],
        uses: ['haywire', 'pg-dolly', 'mocha-chain'],
        related: ['agent-cli', 'openapi'],
        pages: [{ text: 'Overview', link: '' }],
    },
    {
        slug: 'agent-cli',
        title: 'CLI for agents',
        pitch: 'A CLI that makes the notes API easy for AI agents with a shell, with one short command per task and a login that starts from nothing but the API’s URL.',
        source: 'demos/agents/cli',
        files: [
            { label: 'Commands', path: 'demos/agents/cli/src/commands' },
            { label: 'OAuth', path: 'demos/agents/cli/src/lib/oauth.ts' },
            { label: 'Session file', path: 'demos/agents/cli/src/lib/session.ts' },
            { label: 'Composition', path: 'demos/agents/cli/src/container.ts' },
            { label: 'Integration tests', path: 'demos/agents/cli/test/integration/cli.spec.ts' },
            { label: 'Browser stand-in', path: 'demos/agents/cli/test/helpers/browser.ts' },
        ],
        uses: ['haywire', 'haywire-launcher', 'entry-script', 'pg-dolly', 'mocha-chain'],
        related: ['openapi'],
        pages: [{ text: 'Overview', link: '' }],
    },
    {
        slug: 'local-ingress',
        title: 'Local ingress',
        pitch: 'A Vite dev server behind one machine-wide Caddy, so every worktree has its own https://<worktree>.<repo>.localhost, with a locally trusted certificate, hot reload through the proxy, and tunnels for phones.',
        source: 'demos/local-ingress',
        files: [
            { label: 'Vite config', path: 'demos/local-ingress/src/vite-config.ts' },
            {
                label: 'Dev server integration test',
                path: 'demos/local-ingress/test/integration/dev-server.spec.ts',
            },
            { label: 'Run with only Docker', path: 'demos/local-ingress/run' },
            { label: 'The ingress', path: 'tools/local-ingress' },
            { label: 'Its Caddyfile', path: 'tools/local-ingress/Caddyfile' },
            { label: 'Devcontainer labels', path: '.devcontainer/docker-compose.yml' },
        ],
        uses: ['mocha-chain'],
        pages: [{ text: 'Overview', link: '' }],
    },
];

/**
 * The infrastructure this repository runs on, written up like a demo: the same shape, but real, deployed
 * systems rather than examples, so `related` names other infrastructure entries. Pages live in
 * `src/infrastructure/<slug>/`.
 */
export const infrastructure: readonly Demo[] = [
    {
        slug: 'nx-cache',
        title: 'Hosted Nx cache',
        pitch: 'One Nx cache shared by CI and every devcontainer, on a Cloudflare Worker and R2. Anyone can read from it, and only CI on main can write to it, using GitHub OIDC. The Worker is deployed with wrangler, and OpenTofu manages its bucket and tokens.',
        source: 'infra/nx-cache',
        files: [
            { label: 'The Worker', path: 'infra/nx-cache/worker/src/handle.ts' },
            { label: 'OIDC check', path: 'infra/nx-cache/worker/src/github-oidc.ts' },
            {
                label: 'Worker tests',
                path: 'infra/nx-cache/worker/test/integration/worker.spec.ts',
            },
            { label: 'wrangler config', path: 'infra/nx-cache/worker/wrangler.jsonc' },
            { label: 'OpenTofu', path: 'infra/nx-cache/tofu' },
            { label: 'Cache server', path: '.devcontainer/nx-cache-server.mjs' },
            { label: 'CI', path: '.github/workflows/ci.yml' },
            { label: 'Setup runbook', path: 'infra/nx-cache/README.md' },
        ],
        uses: [],
        pages: [{ text: 'Overview', link: '' }],
    },
];

/**
 * The framework section: how this repository's setup works and how another repository adopts it.
 * Each page, `docs/src/framework/<link>.md` (`''` is the overview), is the source of its text: the
 * matching skill points here rather than repeating it.
 */
export const framework: readonly {
    readonly text: string;
    readonly link: string;
    readonly pitch: string;
}[] = [
    {
        text: 'Overview',
        link: '',
        pitch: "This repository's setup as a framework another repository can adopt.",
    },
    {
        text: 'Principles',
        link: 'principles',
        pitch: 'The principles behind the setup, and why: the bar for a package, versions, support floors, dependencies, lint, generated content, workarounds, committing and verifying.',
    },
    {
        text: 'Adoption tiers',
        link: 'adoption',
        pitch: 'Four tiers of adopting the setup, from published checks to the whole devcontainer and CI: what each installs, buys and costs.',
    },
    {
        text: 'Getting started',
        link: 'getting-started',
        pitch: 'From an empty directory to a first package that passes verify, with the published Nx plugin and its generators.',
    },
];

/**
 * Whether a package's overview has anything to show under "Related": related packages (declared on
 * either side), or demos that use it.
 */
export const hasRelated = (slug: string): boolean =>
    packages.some(
        pkg =>
            (pkg.slug === slug && (pkg.related?.length ?? 0) > 0) ||
            (pkg.related?.includes(slug) ?? false)
    ) || demos.some(demo => demo.uses.includes(slug));

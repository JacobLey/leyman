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
     * Slugs of the packages it uses.
     */
    readonly uses: readonly string[];
    /**
     * Slugs of related demos. Declared on one side, shown on both.
     */
    readonly related?: readonly string[];
    readonly pages: readonly Page[];
}

export const packages: readonly Package[] = [
    {
        slug: 'juniper',
        title: 'Juniper',
        category: 'Schemas and types',
        pitch: 'Build JSON Schemas in TypeScript with inferred static types — strict, Ajv-ready, JSON Schema 2020-12 and OpenAPI 3.0 output.',
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
        slug: 'genever',
        title: 'genever',
        category: 'Schemas and types',
        pitch: 'Generate TypeScript types from JSON Schema files and OpenAPI documents, with strict schema checks and the same types Juniper infers.',
        sources: ['apps/genever'],
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
        ],
    },
    {
        slug: 'haywire',
        title: 'Haywire',
        category: 'Dependency injection and scripts',
        pitch: 'Compile-time checked dependency injection for TypeScript — no decorators, no reflect-metadata, no global state.',
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
        sources: ['apps/populate-files/populate-files', 'apps/populate-files/load-populate-files'],
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
        sources: ['tools/generated-signature/generated-signature'],
        pages: [
            { text: 'Overview', link: '' },
            { text: 'Getting started', link: 'getting-started' },
            { text: 'Guides', items: [{ text: 'ESLint', link: 'guides/eslint' }] },
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
        pitch: 'Read-through caching on Valkey or Redis with leases, so each miss is loaded once across every instance, and a load that finishes after an invalidation never caches its outdated value.',
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
        slug: 'read-through-cache',
        title: 'Read-through cache',
        pitch: 'BentoCache on Valkey: a memory tier kept in sync, stale-while-revalidate, one load per key across instances, and sharding over several nodes with weighted rendezvous hashing.',
        source: 'demos/read-through-cache',
        uses: ['lease-cache', 'haywire', 'mocha-chain'],
        pages: [{ text: 'Overview', link: '' }],
    },
    {
        slug: 'openapi',
        title: 'OpenAPI',
        pitch: 'A notes API from spec to database: an OpenAPI 3.1 document built from Juniper schemas, genever types for a typed client and a Hono server that validates every request and response, and Drizzle on Postgres with a database per test.',
        source: 'demos/openapi',
        uses: [
            'juniper',
            'genever',
            'populate-files',
            'pg-dolly',
            'pg-dolly-schema',
            'haywire',
            'mocha-chain',
        ],
        pages: [{ text: 'Overview', link: '' }],
    },
    {
        slug: 'agents',
        title: 'Agents',
        pitch: 'Making the notes API easy for AI agents: an MCP server with tools shaped for tasks, and a CLI that logs in once from the API’s URL and runs one short command per task.',
        source: 'demos/agents',
        uses: ['haywire', 'haywire-launcher', 'entry-script', 'pg-dolly', 'mocha-chain'],
        related: ['openapi', 'oauth-server'],
        pages: [{ text: 'Overview', link: '' }],
    },
    {
        slug: 'oauth-server',
        title: 'Dev OAuth server',
        pitch: 'oidc-provider as a local authorization server: the real OAuth 2.1 flow with a fake login, so the other demos test their auth end to end.',
        source: 'demos/oauth-server',
        uses: ['mocha-chain'],
        pages: [{ text: 'Overview', link: '' }],
    },
];

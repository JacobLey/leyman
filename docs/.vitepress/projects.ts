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
    readonly demos: Readonly<
        Record<
            string,
            {
                readonly source: string;
                readonly files: readonly { readonly label: string; readonly url: string }[];
            }
        >
    >;
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
        pitch: 'A notes API from spec to database: an OpenAPI 3.1 document built from Juniper schemas, genever types for a typed client and a Hono server that validates every request and response, and Drizzle on Postgres with a database per test.',
        source: 'demos/openapi',
        files: [
            { label: 'The spec', path: 'demos/openapi/spec/src/spec.ts' },
            { label: 'openapi.json', path: 'demos/openapi/spec/out/openapi.json' },
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
        slug: 'mcp-server',
        title: 'MCP server',
        pitch: 'Making the notes API easy for AI agents that connect to services: tools shaped for tasks, an OAuth resource server with step-up scopes, and token exchange to call the API as the agent’s user.',
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
        related: ['agent-cli', 'openapi', 'oauth-server'],
        pages: [{ text: 'Overview', link: '' }],
    },
    {
        slug: 'agent-cli',
        title: 'CLI for agents',
        pitch: 'Making the notes API easy for AI agents with a shell: one short command per task, logging in once from the API’s URL, with tokens, refresh and errors handled inside.',
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
        related: ['openapi', 'oauth-server'],
        pages: [{ text: 'Overview', link: '' }],
    },
    {
        slug: 'oauth-server',
        title: 'Dev OAuth server',
        pitch: 'oidc-provider as a local authorization server: the real OAuth 2.1 flow with a fake login, so the other demos test their auth end to end.',
        source: 'demos/oauth-server',
        files: [
            { label: 'Provider configuration', path: 'demos/oauth-server/src/lib/provider.ts' },
            { label: 'Token exchange grant', path: 'demos/oauth-server/src/lib/exchange.ts' },
            { label: 'Flow tests', path: 'demos/oauth-server/test/integration/flow.spec.ts' },
        ],
        uses: ['mocha-chain'],
        related: ['openapi'],
        pages: [{ text: 'Overview', link: '' }],
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

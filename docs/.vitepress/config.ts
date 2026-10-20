import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformerTwoslash } from '@shikijs/vitepress-twoslash';
import ts from 'typescript';
import { defineConfig } from 'vitepress';

const tsConfigPath = fileURLToPath(new URL('../tsconfig.twoslash.json', import.meta.url));
const { options: compilerOptions, errors } = ts.convertCompilerOptionsFromJson(
    JSON.parse(readFileSync(tsConfigPath, 'utf8')).compilerOptions,
    dirname(tsConfigPath)
);
if (errors.length > 0) {
    throw new Error(ts.formatDiagnostics(errors, ts.createCompilerHost({})));
}

export default defineConfig({
    title: 'Leyman',
    description: 'TypeScript libraries and tools for Node.js ESM environments.',
    base: '/leyman/',
    // Tracked pages live in `src/` and the build in `dist/`, like every other project (see the
    // nx-tasks-reference skill)
    srcDir: 'src',
    outDir: 'dist',
    cacheDir: 'node_modules/.vitepress',
    cleanUrls: true,
    lastUpdated: false,
    markdown: {
        codeTransformers: [
            transformerTwoslash({
                // Every `ts` block is type-checked against the packages' built types, not only those
                // marked `twoslash`. A type error not expected with `// @errors` fails the build (the
                // dev server shows it inline instead).
                explicitTrigger: false,
                // Render `// ^?` results inline, pushing the code below down, rather than as a
                // popup over the text. Also shows them without JavaScript.
                queryRendering: 'line',
                twoslashOptions: {
                    compilerOptions,
                    // `typescript` is the `@typescript/typescript6` shim, which re-exports the real
                    // package but has no lib files of its own
                    tsLibDirectory: dirname(ts.getDefaultLibFilePath(compilerOptions)),
                },
            }),
        ],
        // `tsx` too, for code in libraries' JSDoc that twoslash shows in hovers (e.g. TanStack Query's)
        languages: ['js', 'ts', 'tsx', 'json', 'sh'],
    },
    themeConfig: {
        search: { provider: 'local' },
        nav: [{ text: 'Demos', link: '/demos/' }],
        socialLinks: [{ icon: 'github', link: 'https://github.com/JacobLey/leyman' }],
        editLink: {
            pattern: 'https://github.com/JacobLey/leyman/edit/main/docs/src/:path',
        },
        sidebar: [
            {
                text: 'Juniper',
                items: [
                    { text: 'Overview', link: '/juniper/' },
                    { text: 'Getting started', link: '/juniper/getting-started' },
                    {
                        text: 'Guides',
                        items: [
                            { text: 'Reusing schemas', link: '/juniper/guides/reusing-schemas' },
                            {
                                text: 'Deriving object schemas',
                                link: '/juniper/guides/deriving-object-schemas',
                            },
                            { text: 'OpenAPI', link: '/juniper/guides/openapi' },
                            { text: 'Recipes', link: '/juniper/guides/recipes' },
                            { text: 'ESLint', link: '/juniper/guides/eslint' },
                        ],
                    },
                    {
                        text: 'Reference',
                        items: [
                            { text: 'Schemas', link: '/juniper/reference/schemas' },
                            { text: 'API', link: '/juniper/reference/api' },
                        ],
                    },
                    { text: 'Why Juniper', link: '/juniper/why' },
                ],
            },
            {
                text: 'Juniper Validator',
                items: [
                    { text: 'Overview', link: '/juniper-validator/' },
                    { text: 'Getting started', link: '/juniper-validator/getting-started' },
                    {
                        text: 'Guides',
                        items: [
                            {
                                text: 'Standard Schema',
                                link: '/juniper-validator/guides/standard-schema',
                            },
                        ],
                    },
                    {
                        text: 'Reference',
                        items: [{ text: 'API', link: '/juniper-validator/reference/api' }],
                    },
                ],
            },
            {
                text: 'genever',
                items: [
                    { text: 'Overview', link: '/genever/' },
                    { text: 'Getting started', link: '/genever/getting-started' },
                    {
                        text: 'Guides',
                        items: [
                            { text: 'Strict mode', link: '/genever/guides/strict-mode' },
                            { text: 'OpenAPI documents', link: '/genever/guides/openapi' },
                            {
                                text: 'References to other files',
                                link: '/genever/guides/references',
                            },
                            {
                                text: 'Juniper round trip',
                                link: '/genever/guides/juniper-round-trip',
                            },
                        ],
                    },
                    {
                        text: 'Reference',
                        items: [
                            { text: 'Type mapping', link: '/genever/reference/types' },
                            { text: 'API and CLI', link: '/genever/reference/api' },
                        ],
                    },
                    { text: 'Why genever', link: '/genever/why' },
                ],
            },
            {
                text: 'Haywire',
                items: [
                    { text: 'Overview', link: '/haywire/' },
                    { text: 'Getting started', link: '/haywire/getting-started' },
                    {
                        text: 'Guides',
                        items: [
                            { text: 'Scopes', link: '/haywire/guides/scopes' },
                            { text: 'Suppliers', link: '/haywire/guides/suppliers' },
                            {
                                text: 'Circular dependencies',
                                link: '/haywire/guides/circular-dependencies',
                            },
                            { text: 'Lists', link: '/haywire/guides/lists' },
                            { text: 'Runtime values', link: '/haywire/guides/runtime-values' },
                            { text: 'Disposal', link: '/haywire/guides/disposal' },
                            { text: 'Testing', link: '/haywire/guides/testing' },
                            { text: 'Debugging', link: '/haywire/guides/debugging' },
                            { text: 'Web frameworks', link: '/haywire/guides/frameworks' },
                            { text: 'Migrating', link: '/haywire/guides/migrating' },
                        ],
                    },
                    {
                        text: 'Reference',
                        items: [{ text: 'API', link: '/haywire/reference/api' }],
                    },
                    { text: 'Upgrading to 2.0', link: '/haywire/upgrading' },
                    { text: 'Why Haywire', link: '/haywire/why' },
                ],
            },
            {
                text: 'entry-script',
                items: [
                    { text: 'Overview', link: '/entry-script/' },
                    { text: 'Getting started', link: '/entry-script/getting-started' },
                    {
                        text: 'Reference',
                        items: [{ text: 'API', link: '/entry-script/reference/api' }],
                    },
                ],
            },
            {
                text: 'haywire-launcher',
                items: [
                    { text: 'Overview', link: '/haywire-launcher/' },
                    { text: 'Getting started', link: '/haywire-launcher/getting-started' },
                    {
                        text: 'Reference',
                        items: [{ text: 'API', link: '/haywire-launcher/reference/api' }],
                    },
                ],
            },
            {
                text: 'nx-lifecycle',
                items: [
                    { text: 'Overview', link: '/nx-lifecycle/' },
                    { text: 'Getting started', link: '/nx-lifecycle/getting-started' },
                    {
                        text: 'Guides',
                        items: [
                            {
                                text: 'Stages and hooks',
                                link: '/nx-lifecycle/guides/stages-and-hooks',
                            },
                            {
                                text: 'Overriding inferred targets',
                                link: '/nx-lifecycle/guides/overriding-targets',
                            },
                            { text: 'Executor', link: '/nx-lifecycle/guides/executor' },
                        ],
                    },
                    {
                        text: 'Reference',
                        items: [
                            {
                                text: 'Configuration',
                                link: '/nx-lifecycle/reference/configuration',
                            },
                            { text: 'CLI', link: '/nx-lifecycle/reference/cli' },
                        ],
                    },
                    { text: 'Why nx-lifecycle', link: '/nx-lifecycle/why' },
                ],
            },
            {
                text: 'Barrelify',
                items: [
                    { text: 'Overview', link: '/barrelify/' },
                    { text: 'Getting started', link: '/barrelify/getting-started' },
                    {
                        text: 'Guides',
                        items: [
                            { text: 'Module systems', link: '/barrelify/guides/module-systems' },
                        ],
                    },
                    {
                        text: 'Reference',
                        items: [{ text: 'API and CLI', link: '/barrelify/reference/api' }],
                    },
                ],
            },
            {
                text: 'populate-files',
                items: [
                    { text: 'Overview', link: '/populate-files/' },
                    { text: 'Getting started', link: '/populate-files/getting-started' },
                    {
                        text: 'Guides',
                        items: [
                            {
                                text: 'Config modules and the CLI',
                                link: '/populate-files/guides/config-modules',
                            },
                            { text: 'Signed files', link: '/populate-files/guides/signed-files' },
                            { text: 'Manifest', link: '/populate-files/guides/manifest' },
                        ],
                    },
                    {
                        text: 'Reference',
                        items: [
                            { text: 'API', link: '/populate-files/reference/api' },
                            { text: 'CLI', link: '/populate-files/reference/cli' },
                        ],
                    },
                ],
            },
            {
                text: 'generated-signature',
                items: [
                    { text: 'Overview', link: '/generated-signature/' },
                    { text: 'Getting started', link: '/generated-signature/getting-started' },
                    {
                        text: 'Guides',
                        items: [{ text: 'ESLint', link: '/generated-signature/guides/eslint' }],
                    },
                    {
                        text: 'Reference',
                        items: [
                            { text: 'File format', link: '/generated-signature/reference/format' },
                            { text: 'API', link: '/generated-signature/reference/api' },
                        ],
                    },
                ],
            },
            {
                text: 'normalized-react-query',
                items: [
                    { text: 'Overview', link: '/normalized-react-query/' },
                    { text: 'Getting started', link: '/normalized-react-query/getting-started' },
                    {
                        text: 'Guides',
                        items: [
                            {
                                text: 'Linked queries',
                                link: '/normalized-react-query/guides/linked-queries',
                            },
                            {
                                text: 'Infinite queries',
                                link: '/normalized-react-query/guides/infinite-queries',
                            },
                            {
                                text: 'Server rendering',
                                link: '/normalized-react-query/guides/server-rendering',
                            },
                        ],
                    },
                    {
                        text: 'Reference',
                        items: [{ text: 'API', link: '/normalized-react-query/reference/api' }],
                    },
                    { text: 'Why normalized-react-query', link: '/normalized-react-query/why' },
                ],
            },
            {
                text: 'mocha-chain',
                items: [
                    { text: 'Overview', link: '/mocha-chain/' },
                    { text: 'Getting started', link: '/mocha-chain/getting-started' },
                    {
                        text: 'Guides',
                        items: [{ text: 'Chaining hooks', link: '/mocha-chain/guides/chaining' }],
                    },
                    {
                        text: 'Reference',
                        items: [{ text: 'API', link: '/mocha-chain/reference/api' }],
                    },
                    { text: 'Why mocha-chain', link: '/mocha-chain/why' },
                ],
            },
            {
                text: 'vitest-chain',
                items: [
                    { text: 'Overview', link: '/vitest-chain/' },
                    { text: 'Getting started', link: '/vitest-chain/getting-started' },
                    {
                        text: 'Reference',
                        items: [{ text: 'API', link: '/vitest-chain/reference/api' }],
                    },
                ],
            },
            {
                text: 'lease-cache',
                items: [
                    { text: 'Overview', link: '/lease-cache/' },
                    { text: 'Getting started', link: '/lease-cache/getting-started' },
                    {
                        text: 'Guides',
                        items: [
                            { text: 'Clients', link: '/lease-cache/guides/clients' },
                            { text: 'Invalidation', link: '/lease-cache/guides/invalidation' },
                        ],
                    },
                    {
                        text: 'Reference',
                        items: [{ text: 'API', link: '/lease-cache/reference/api' }],
                    },
                    { text: 'Why lease-cache', link: '/lease-cache/why' },
                ],
            },
            {
                text: 'pg-dolly',
                items: [
                    { text: 'Overview', link: '/pg-dolly/' },
                    { text: 'Getting started', link: '/pg-dolly/getting-started' },
                    {
                        text: 'Guides',
                        items: [
                            { text: 'Test runners', link: '/pg-dolly/guides/test-runners' },
                            { text: 'The schema', link: '/pg-dolly/guides/schema' },
                            {
                                text: 'Deterministic tests',
                                link: '/pg-dolly/guides/deterministic-tests',
                            },
                            { text: 'How it works', link: '/pg-dolly/guides/how-it-works' },
                        ],
                    },
                    {
                        text: 'Reference',
                        items: [{ text: 'API', link: '/pg-dolly/reference/api' }],
                    },
                    { text: 'Why pg-dolly', link: '/pg-dolly/why' },
                ],
            },
            {
                text: 'pg-dolly-schema',
                items: [
                    { text: 'Overview', link: '/pg-dolly-schema/' },
                    { text: 'Getting started', link: '/pg-dolly-schema/getting-started' },
                    {
                        text: 'Reference',
                        items: [{ text: 'API and CLI', link: '/pg-dolly-schema/reference/api' }],
                    },
                ],
            },
            {
                text: 'unknown-error',
                items: [
                    { text: 'Overview', link: '/unknown-error/' },
                    { text: 'Getting started', link: '/unknown-error/getting-started' },
                    {
                        text: 'Guides',
                        items: [
                            {
                                text: 'Converting caught values',
                                link: '/unknown-error/guides/converting',
                            },
                            { text: 'Cause chains', link: '/unknown-error/guides/cause-chains' },
                        ],
                    },
                    {
                        text: 'Reference',
                        items: [{ text: 'API', link: '/unknown-error/reference/api' }],
                    },
                    { text: 'Why unknown-error', link: '/unknown-error/why' },
                ],
            },
            {
                text: 'Demos',
                items: [
                    { text: 'Overview', link: '/demos/' },
                    { text: 'Read-through cache', link: '/demos/read-through-cache' },
                    { text: 'OpenAPI', link: '/demos/openapi' },
                ],
            },
        ],
    },
});

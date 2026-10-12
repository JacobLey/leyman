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
        languages: ['js', 'ts', 'json', 'sh'],
    },
    themeConfig: {
        search: { provider: 'local' },
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
                        ],
                    },
                    {
                        text: 'Reference',
                        items: [{ text: 'API', link: '/haywire/reference/api' }],
                    },
                    { text: 'Why Haywire', link: '/haywire/why' },
                ],
            },
        ],
    },
});

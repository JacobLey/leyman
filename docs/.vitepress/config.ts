import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformerTwoslash } from '@shikijs/vitepress-twoslash';
import ts from 'typescript';
import { type DefaultTheme, defineConfig } from 'vitepress';
import { categories, demos, type Page, packages } from './projects.js';

const tsConfigPath = fileURLToPath(new URL('../tsconfig.twoslash.json', import.meta.url));
const { options: compilerOptions, errors } = ts.convertCompilerOptionsFromJson(
    JSON.parse(readFileSync(tsConfigPath, 'utf8')).compilerOptions,
    dirname(tsConfigPath)
);
if (errors.length > 0) {
    throw new Error(ts.formatDiagnostics(errors, ts.createCompilerHost({})));
}

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const srcDir = fileURLToPath(new URL('../src/', import.meta.url));

/**
 * Fails the build when the registry and the repo disagree: a source path that moved, a slug that
 * names nothing, or a pages directory with no entry.
 */
const checkRegistry = (): void => {
    const problems: string[] = [];
    const packageSlugs = new Set(packages.map(({ slug }) => slug));
    const demoSlugs = new Set(demos.map(({ slug }) => slug));
    for (const { slug, sources, related = [] } of packages) {
        for (const source of sources) {
            if (!existsSync(`${repoRoot}${source}/package.json`)) {
                problems.push(`Package ${slug}: no package.json in ${source}`);
            }
        }
        for (const other of related) {
            if (!packageSlugs.has(other)) {
                problems.push(`Package ${slug}: related package ${other} is not documented`);
            }
        }
    }
    for (const { slug, source, uses, related = [] } of demos) {
        if (!existsSync(`${repoRoot}${source}`)) {
            problems.push(`Demo ${slug}: ${source} does not exist`);
        }
        for (const used of uses) {
            if (!packageSlugs.has(used)) {
                problems.push(`Demo ${slug}: used package ${used} is not documented`);
            }
        }
        for (const other of related) {
            if (!demoSlugs.has(other)) {
                problems.push(`Demo ${slug}: related demo ${other} does not exist`);
            }
        }
    }
    for (const [section, slugs] of [
        ['packages', packageSlugs],
        ['demos', demoSlugs],
    ] as const) {
        for (const entry of readdirSync(`${srcDir}${section}`, { withFileTypes: true })) {
            if (entry.isDirectory() && !slugs.has(entry.name)) {
                problems.push(`src/${section}/${entry.name} has no entry in projects.ts`);
            }
        }
    }
    if (problems.length > 0) {
        throw new Error(`docs/.vitepress/projects.ts:\n${problems.join('\n')}`);
    }
};
checkRegistry();

const toSidebarItem = (base: string, page: Page): DefaultTheme.SidebarItem =>
    'items' in page
        ? { text: page.text, items: page.items.map(item => toSidebarItem(base, item)) }
        : { text: page.text, link: `${base}${page.link}` };

/**
 * Every package's name, grouped by category, with the pages of `open` (if any) expanded.
 */
const packagesSidebar = (open?: string): DefaultTheme.SidebarItem[] => [
    { text: 'All packages', link: '/packages/' },
    ...categories.map(category => ({
        text: category,
        items: packages
            .filter(pkg => pkg.category === category)
            .map(({ slug, title, pages }) => ({
                text: title,
                collapsed: slug !== open,
                items: pages.map(page => toSidebarItem(`/packages/${slug}/`, page)),
            })),
    })),
];

const demosSidebar = (open?: string): DefaultTheme.SidebarItem[] => [
    { text: 'All demos', link: '/demos/' },
    ...demos.map(({ slug, title, pages }) =>
        pages.length === 1
            ? { text: title, link: `/demos/${slug}/` }
            : {
                  text: title,
                  collapsed: slug !== open,
                  items: pages.map(page => toSidebarItem(`/demos/${slug}/`, page)),
              }
    ),
];

// One sidebar per package and demo (VitePress picks the longest matching path), so the current
// one is already expanded in the rendered HTML, rather than only after the page's script runs
const sidebar: DefaultTheme.SidebarMulti = Object.fromEntries([
    ['/packages/', packagesSidebar()],
    ...packages.map(({ slug }) => [`/packages/${slug}/`, packagesSidebar(slug)]),
    ['/demos/', demosSidebar()],
    ...demos.map(({ slug }) => [`/demos/${slug}/`, demosSidebar(slug)]),
]);

const nav: DefaultTheme.NavItem[] = [
    {
        text: 'Packages',
        activeMatch: '^/packages/',
        items: [
            { text: 'All packages', link: '/packages/' },
            ...categories.map(category => ({
                text: category,
                items: packages
                    .filter(pkg => pkg.category === category)
                    .map(({ slug, title }) => ({ text: title, link: `/packages/${slug}/` })),
            })),
        ],
    },
    {
        text: 'Demos',
        activeMatch: '^/demos/',
        items: [
            { text: 'All demos', link: '/demos/' },
            ...demos.map(({ slug, title }) => ({ text: title, link: `/demos/${slug}/` })),
        ],
    },
];

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
        nav,
        socialLinks: [{ icon: 'github', link: 'https://github.com/JacobLey/leyman' }],
        editLink: {
            pattern: 'https://github.com/JacobLey/leyman/edit/main/docs/src/:path',
        },
        sidebar,
    },
});

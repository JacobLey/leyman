import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformerTwoslash } from '@shikijs/vitepress-twoslash';
import ts from 'typescript';
import { type DefaultTheme, defineConfigWithTheme } from 'vitepress';
import { categories, demos, hasRelated, type Links, type Page, packages } from './projects.js';

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
            for (const file of ['package.json', 'CHANGELOG.md']) {
                if (!existsSync(`${repoRoot}${source}/${file}`)) {
                    problems.push(`Package ${slug}: no ${file} in ${source}`);
                }
            }
        }
        for (const other of related) {
            if (!packageSlugs.has(other)) {
                problems.push(`Package ${slug}: related package ${other} is not documented`);
            }
        }
    }
    for (const { slug, source, files, uses, related = [] } of demos) {
        for (const path of [source, ...files.map(file => file.path)]) {
            if (!existsSync(`${repoRoot}${path}`)) {
                problems.push(`Demo ${slug}: ${path} does not exist`);
            }
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
    // Overview pages place the generated blocks themselves, so their markdown shows what renders.
    // "Related" is there exactly when it has something to show.
    for (const [section, slug, related] of [
        ...packages.map(({ slug }) => ['packages', slug, hasRelated(slug)] as const),
        ...demos.map(({ slug }) => ['demos', slug, undefined] as const),
    ]) {
        const path = `src/${section}/${slug}/index.md`;
        const page = existsSync(`${srcDir}${section}/${slug}/index.md`)
            ? readFileSync(`${srcDir}${section}/${slug}/index.md`, 'utf8')
            : '';
        if (!page.includes('<ProjectHeader />')) {
            problems.push(`${path} is missing <ProjectHeader /> under its title`);
        }
        if (related !== undefined && page.includes('<ProjectRelated />') !== related) {
            problems.push(
                related
                    ? `${path} is missing "## Related" with <ProjectRelated />`
                    : `${path} has <ProjectRelated />, with nothing related to show`
            );
        }
    }
    if (problems.length > 0) {
        throw new Error(`docs/.vitepress/projects.ts:\n${problems.join('\n')}`);
    }
};
checkRegistry();

const github = (path: string): string =>
    `https://github.com/JacobLey/leyman/${statSync(`${repoRoot}${path}`).isDirectory() ? 'tree' : 'blob'}/main/${path}`;

const links: Links = {
    packages: Object.fromEntries(
        packages.map(({ slug, sources }) => [
            slug,
            sources.map(source => {
                const { name } = JSON.parse(
                    readFileSync(`${repoRoot}${source}/package.json`, 'utf8')
                ) as {
                    name: string;
                };
                return {
                    name,
                    npm: `https://www.npmjs.com/package/${name}`,
                    source: github(source),
                    changelog: github(`${source}/CHANGELOG.md`),
                };
            }),
        ])
    ),
    demos: Object.fromEntries(
        demos.map(({ slug, source, files }) => [
            slug,
            {
                source: github(source),
                files: files.map(({ label, path }) => ({ label, url: github(path) })),
            },
        ])
    ),
};

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

const flattenPages = (base: string, pages: readonly Page[]): { text: string; link: string }[] =>
    pages.flatMap(page =>
        'items' in page
            ? flattenPages(base, page.items)
            : [{ text: page.text, link: `${base}${page.link}` }]
    );

/**
 * Previous and next links, within one package or demo. VitePress would otherwise follow the
 * sidebar into the neighbouring package.
 */
const pageOrder = new Map(
    [
        ...packages.map(({ slug, pages }) => flattenPages(`/packages/${slug}/`, pages)),
        ...demos.map(({ slug, pages }) => flattenPages(`/demos/${slug}/`, pages)),
    ].flatMap(order =>
        order.map((page, index) => [
            page.link,
            { prev: order[index - 1] ?? false, next: order[index + 1] ?? false },
        ])
    )
);

/**
 * Package pages used to be at the site root (`/haywire/guides/scopes`), and those URLs are in
 * published READMEs and ESLint rules' docs links. Writes a redirect page at each old path, keeping
 * the `#hash`. Generated from the registry, so nothing is kept by hand. (Old demo URLs need none:
 * GitHub Pages redirects `/demos/openapi` to the directory `/demos/openapi/` itself.)
 */
const writeRedirects = (outDir: string, base: string): void => {
    for (const { slug, pages } of packages) {
        for (const { link } of flattenPages(`/packages/${slug}/`, pages)) {
            const target = `${base}${link.slice(1)}`;
            const old = link.slice('/packages/'.length);
            const file = join(outDir, old.endsWith('/') ? `${old}index.html` : `${old}.html`);
            mkdirSync(dirname(file), { recursive: true });
            writeFileSync(
                file,
                `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Moved</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${target}">
<meta http-equiv="refresh" content="0; url=${target}">
<script>location.replace(${JSON.stringify(target)} + location.hash)</script>
<p>This page moved to <a href="${target}">${target}</a>.</p>
</html>
`
            );
        }
    }
};

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

export default defineConfigWithTheme<DefaultTheme.Config & { links: Links }>({
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
    buildEnd({ outDir, site }) {
        writeRedirects(outDir, site.base);
    },
    transformPageData(pageData) {
        // `packages/haywire/index.md` is linked as `/packages/haywire/`, other pages without `.md`
        const link = `/${pageData.relativePath.replace(/(?<=^|\/)index\.md$/u, '').replace(/\.md$/u, '')}`;
        const order = pageOrder.get(link);
        if (order) {
            pageData.frontmatter.prev ??= order.prev;
            pageData.frontmatter.next ??= order.next;
        }
    },
    themeConfig: {
        search: { provider: 'local' },
        nav,
        socialLinks: [{ icon: 'github', link: 'https://github.com/JacobLey/leyman' }],
        editLink: {
            pattern: 'https://github.com/JacobLey/leyman/edit/main/docs/src/:path',
        },
        sidebar,
        links,
    },
});

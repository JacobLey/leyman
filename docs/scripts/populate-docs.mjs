/**
 * Generates the package lists that docs repeat: the README's package and demo tables, the
 * projects skill's tables, the docs-site skill's tables, `docs/README.md`'s list of documented
 * packages, the paths of the docs-site rule, and the package dropdowns of the issue templates.
 * Also the principles skill `@leyman/configs` ships, from the principles page, and the skills
 * table of `AGENTS.md`, from each skill's frontmatter. And each documented package's `why` page,
 * from its `WHY-<PACKAGE>.md`, and each demo's page, from its READMEs.
 *
 * Data comes from each project's `package.json` (or `project.json` `metadata.description` for a
 * project with none), from `docs/.vitepress/projects.ts`, and from the skills' `SKILL.md` files. Prose lives in manual sections, kept
 * across runs. Files are signed, so an edit outside a manual section fails the next run; in CI
 * (`CI` set) a file that would change fails it. `--force` overwrites edited or unsigned files.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { manualSection, signatureToken } from 'generated-signature';
import { populateFiles } from 'populate-files';
import { demos, infrastructure, packages } from '../.vitepress/projects.ts';

const root = path.resolve(import.meta.dirname, '../..');

/**
 * Sections of the projects skill, in order, and the top-level folders each holds. A project in a
 * folder listed nowhere fails the run.
 */
const sections = [
    { title: 'Apps', folders: ['apps'] },
    { title: 'Tools', folders: ['tools'] },
    { title: 'Leyman', folders: ['leyman'] },
    { title: 'Docs', folders: ['docs'] },
    { title: 'E2E', folders: ['e2e'] },
    { title: 'Demos', folders: ['demos'] },
    { title: 'Infra', folders: ['infra', 'dagger'] },
];
/**
 * Folders whose projects are all private, so marking each one would say nothing.
 */
const privateFolders = new Set(['docs', 'e2e', 'demos', 'infra', 'dagger']);
/**
 * Folders whose project names repeat the folder (`@leyman/e2e-…`), so the path under it is shown.
 */
const pathNamedFolders = new Set(['e2e', 'demos', 'infra']);
const skippedDirectories = new Set(['node_modules', 'dist', 'out', 'target', 'coverage']);

const readJson = filePath => JSON.parse(readFileSync(path.join(root, filePath), 'utf8'));

const findProjects = directory => {
    const entries = readdirSync(path.join(root, directory), { withFileTypes: true });
    const nested = entries
        .filter(
            entry =>
                entry.isDirectory() &&
                !entry.name.startsWith('.') &&
                !skippedDirectories.has(entry.name)
        )
        .flatMap(entry => findProjects(path.posix.join(directory, entry.name)));
    return entries.some(entry => entry.name === 'project.json') ? [directory, ...nested] : nested;
};

const readProject = directory => {
    const project = readJson(path.posix.join(directory, 'project.json'));
    const packageJsonPath = path.posix.join(directory, 'package.json');
    const packageJson = existsSync(path.join(root, packageJsonPath))
        ? readJson(packageJsonPath)
        : null;
    const [folder] = directory.split('/', 1);
    const description = packageJson?.description ?? project.metadata?.description;
    if (!description) {
        throw new Error(
            `${directory} has no description: set package.json "description", or project.json "metadata.description" if it has no package.json`
        );
    }
    const dependencies = Object.values({
        ...packageJson?.dependencies,
        ...packageJson?.devDependencies,
    });
    return {
        directory,
        folder,
        description,
        name: (packageJson?.name ?? project.name).replace(/^@leyman\//v, ''),
        // What npm knows it by, scope included
        npmName: packageJson?.name,
        published: packageJson !== null && packageJson.private !== true,
        typescriptNext: dependencies.includes('catalog:typescript-next'),
        go: existsSync(path.join(root, directory, 'go.mod')),
        rust: existsSync(path.join(root, directory, 'Cargo.toml')),
    };
};

const projects = sections
    .flatMap(section => section.folders)
    .filter(folder => existsSync(path.join(root, folder)))
    .flatMap(folder => findProjects(folder))
    .map(directory => readProject(directory));
const projectsByDirectory = new Map(projects.map(project => [project.directory, project]));

const strayProjects = readdirSync(root, { withFileTypes: true })
    .filter(
        entry =>
            entry.isDirectory() &&
            !entry.name.startsWith('.') &&
            !skippedDirectories.has(entry.name) &&
            sections.every(section => !section.folders.includes(entry.name))
    )
    .flatMap(entry => findProjects(entry.name));
if (strayProjects.length > 0) {
    throw new Error(
        `Projects in a folder with no section in populate-docs.mjs: ${strayProjects.join(', ')}`
    );
}

const docsSite = 'https://jacobley.github.io/leyman';
const force = process.argv.includes('--force');

const byName = (a, b) => a.localeCompare(b, 'en');
const code = text => `\`${text}\``;
const cell = text => text.replaceAll('|', String.raw`\|`);
/**
 * Pitches in `projects.ts` are plain text (the site renders them as text), so `<` is escaped.
 *
 * @param text - a pitch
 * @returns the pitch as Markdown
 */
const plain = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const list = items =>
    items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items.join('');

/**
 * Formats Markdown with the repo's Biome config, so a run of the formatter over the generated file
 * changes nothing.
 *
 * @param markdown - a fragment of a generated file
 * @returns the formatted fragment, without a trailing line break
 * @throws when Biome fails
 */
const format = markdown => {
    const result = spawnSync(
        path.join(import.meta.dirname, '../node_modules/.bin/biome'),
        ['format', '--stdin-file-path=generated.md'],
        { cwd: root, input: markdown, encoding: 'utf8' }
    );
    if (result.status !== 0) {
        throw new Error(`biome format failed: ${result.stderr}`);
    }
    return result.stdout.trimEnd();
};

const table = (headers, rows) =>
    format(
        [
            `| ${headers.join(' | ')} |`,
            `| ${headers.map(() => '---').join(' | ')} |`,
            ...rows.map(row => `| ${row.map(text => cell(text)).join(' | ')} |`),
        ].join('\n')
    );

const notes = project =>
    [
        project.published || privateFolders.has(project.folder) ? null : 'private',
        project.typescriptNext ? 'on `catalog:typescript-next`' : null,
        project.go ? 'Go' : null,
        project.rust ? 'Rust' : null,
    ].filter(note => note !== null);
const displayName = project =>
    pathNamedFolders.has(project.folder)
        ? project.directory.slice(project.folder.length + 1)
        : project.name;
// A link from a skill to a repo path
const link = target => `[${code(target)}](../../../${target})`;
const whyFiles = directory =>
    readdirSync(path.join(root, directory))
        .filter(name => /^WHY-.+\.md$/v.test(name))
        .map(name => `${directory}/${name}`);
const readmes = directory =>
    existsSync(path.join(root, directory, 'README.md')) ? [`${directory}/README.md`] : [];

const manual = (filePath, id) => manualSection({ id, filePath });
const header = () =>
    `<!-- ${signatureToken()} Generated by docs/scripts/populate-docs.mjs (nx run @leyman/docs:populate-files). Edit only inside manual sections. -->`;

/**
 * Every npm package the docs site documents, with the slug of its pages.
 */
const documented = packages
    .flatMap(({ slug, sources }) =>
        sources.map(source => {
            const project = projectsByDirectory.get(source);
            if (!project) {
                throw new Error(`projects.ts names ${source} for ${slug}, which is not a project`);
            }
            return { slug, project };
        })
    )
    .toSorted((a, b) => byName(a.project.name, b.project.name));

const readme = () => {
    const filePath = 'README.md';
    const published = projects
        .filter(project => project.published)
        .toSorted((a, b) => byName(a.npmName, b.npmName));
    const slugs = new Map(documented.map(({ slug, project }) => [project.directory, slug]));
    // A documented package links its docs page (which links npm), the rest link npm
    const packageLink = project => {
        const slug = slugs.get(project.directory);
        return slug
            ? `${docsSite}/packages/${slug}/`
            : `https://www.npmjs.com/package/${project.npmName}`;
    };
    return `${header()}

${manual(filePath, 'intro')}

## Packages

Published to npm:

${table(
    ['Package', 'Description', 'Source'],
    published.map(project => [
        `[${code(project.npmName)}](${packageLink(project)})`,
        project.description,
        `[${code(project.directory)}](./${project.directory})`,
    ])
)}

${manual(filePath, 'packages')}

A [documentation site](${docsSite}/), with every code example type-checked, is built from [\`docs/\`](./docs) (${list(documented.map(({ project }) => code(project.name)))} so far), plus the demos.

## Demos

${manual(filePath, 'demos')}

${table(
    ['Demo', 'What it shows', 'Source'],
    demos.map(demo => [
        `[${demo.title}](${docsSite}/demos/${demo.slug}/)`,
        plain(demo.pitch),
        `[${code(demo.source)}](./${demo.source})`,
    ])
)}

${manual(filePath, 'rest')}
`;
};

const docsReadme = () => {
    const filePath = 'docs/README.md';
    return `${header()}

${manual(filePath, 'intro')}

Documents ${list(documented.map(({ project }) => `[${code(project.name)}](../${project.directory})`))} so far, plus the demos.

${manual(filePath, 'rest')}
`;
};

const projectsSkill = () => {
    const filePath = '.agents/skills/projects/SKILL.md';
    const tables = sections.map(section => {
        const rows = projects
            .filter(project => section.folders.includes(project.folder))
            .map(project => ({ project, name: displayName(project) }))
            .toSorted((a, b) => byName(a.name, b.name))
            .map(({ project, name }) => {
                const projectNotes = notes(project);
                return [
                    `[${code(name)}](../../../${project.directory}/)`,
                    projectNotes.length > 0
                        ? `${project.description} (${projectNotes.join(', ')})`
                        : project.description,
                ];
            });
        return `### ${section.title}\n\n${table(['Project', 'Description'], rows)}`;
    });
    return `---
name: projects
description: Understanding the various projects/packages available
---

${header()}

${manual(filePath, 'intro')}

${tables.join('\n\n')}
`;
};

const docsSiteSkill = () => {
    const filePath = '.agents/skills/docs-site/SKILL.md';
    const showcaseTable = (heading, kind, entries) =>
        table(
            [heading, 'Page'],
            entries.map(entry => [
                link(`${entry.source}/`),
                link(`docs/src/${kind}/${entry.slug}/index.md`),
            ])
        );
    return `---
name: docs-site
description: Writing docs site pages, and keeping them in sync when a documented package changes
---

${header()}

${manual(filePath, 'intro')}

## Documented packages

${table(
    ['Package', 'Pages'],
    documented.map(({ slug, project }) => [
        `[${code(project.name)}](../../../${project.directory}/)`,
        link(`docs/src/packages/${slug}/`),
    ])
)}

${manual(filePath, 'demos')}

${showcaseTable('Demo', 'demos', demos)}

${manual(filePath, 'infrastructure')}

${showcaseTable('Infrastructure', 'infrastructure', infrastructure)}

${manual(filePath, 'rest')}
`;
};

const docsSiteRule = () => {
    const filePath = '.claude/rules/docs-site-sync.md';
    const paths = [
        ...packages.flatMap(({ sources }) =>
            sources.flatMap(source => [`${source}/src/**`, ...readmes(source), ...whyFiles(source)])
        ),
        ...[...demos, ...infrastructure].flatMap(({ source }) => [
            `${source}/**/src/**`,
            `${source}/**/README.md`,
        ]),
    ].toSorted(byName);
    return `---
paths:
${paths.map(entry => `  - "${entry}"`).join('\n')}
${manualSection({ id: 'paths', comment: { start: '#' }, indent: '  ' })}
---

${header()}

${manual(filePath, 'body')}
`;
};

/**
 * An issue template, with a dropdown of every published package between its manual sections.
 *
 * @param filePath - the template, a GitHub issue form
 * @param description - the dropdown's description
 * @returns the template's content
 */
const issueTemplate = (filePath, description) => () => {
    const yamlManual = (id, indent = '') => manualSection({ id, filePath, indent });
    // `@` can't start a plain YAML scalar
    const option = name => (name.startsWith('@') ? JSON.stringify(name) : name);
    const options = projects
        .filter(project => project.published)
        .map(project => project.npmName)
        .toSorted(byName)
        .map(name => `        - ${option(name)}`);
    return `# ${signatureToken()} Generated by docs/scripts/populate-docs.mjs (nx run @leyman/docs:populate-files). Edit only inside manual sections.
${yamlManual('intro')}
  - type: dropdown
    id: package
    attributes:
      label: Package
      description: ${description}
      options:
${options.join('\n')}
${yamlManual('other', '        ')}
    validations:
      required: true
${yamlManual('rest')}
`;
};

/**
 * Paths Dagger leaves out of CI's source (`New` in `dagger/main.go`). A file under one that is
 * absent is skipped rather than reported missing, so `build` passes there. CI's `Floors` checks
 * them instead, adding back only the files generated here (its `generated` argument), as does any
 * full checkout.
 */
const ciExcluded = ['.agents', '.claude', '.github', 'AGENTS.md', 'README.md'];
const excludedHere = filePath =>
    ciExcluded.some(
        excluded =>
            (filePath === excluded || filePath.startsWith(`${excluded}/`)) &&
            !existsSync(path.join(root, excluded))
    );

/**
 * The principles page as a skill, so a repository reads the principles of the version it installs.
 */
const principlesSkill = () => {
    const page = readFileSync(path.join(root, 'docs/src/framework/principles.md'), 'utf8');
    const body = page.replace(/^---\n.*?\n---\n\n/sv, '');
    return `---
name: principles
description: The principles behind the leyman framework (the bar for packages, versioning, support floors, dependencies, lint, generated content, patches, and how work is committed and verified), and why. Read before a design, a review or an audit, and decide by them anything no other skill covers
---

${header()}

${body}`;
};

const githubRepo = 'https://github.com/JacobLey/leyman';

/**
 * The site page generated from each repo path, or standing for it: a documented package's
 * directory and README map to its overview, its WHY file to its `why` page, and a demo's or
 * infrastructure entry's directory and README to its page (and a demo's other `readmes`). Only a
 * page generated from the file
 * itself (`fromSource`) keeps a link's anchor, since only there do the headings match.
 */
const sitePages = new Map([
    ...packages.flatMap(({ slug, sources }) =>
        sources.flatMap(source => [
            [source, { page: `/packages/${slug}/` }],
            [`${source}/README.md`, { page: `/packages/${slug}/` }],
            ...whyFiles(source).map(file => [
                file,
                { page: `/packages/${slug}/why`, fromSource: true },
            ]),
        ])
    ),
    ...demos.flatMap(({ slug, source, readmes = [] }) => [
        [source, { page: `/demos/${slug}/` }],
        ...[`${source}/README.md`, ...readmes.map(readme => readme.path)].map(readme => [
            readme,
            { page: `/demos/${slug}/`, fromSource: true },
        ]),
    ]),
    ...infrastructure.flatMap(({ slug, source }) => [
        [source, { page: `/infrastructure/${slug}/` }],
        [`${source}/README.md`, { page: `/infrastructure/${slug}/` }],
    ]),
]);
const npmPages = new Map(
    documented.map(({ slug, project }) => [project.npmName, `/packages/${slug}/`])
);

/**
 * Rewrites a link in a repo file for the site page generated from it. Links into the site become
 * site paths; a link to a documented package's npm page, or to a repo path with a site page,
 * becomes that page; any other relative link becomes its GitHub URL. Everything else is kept.
 *
 * @param target - the link's target, as written
 * @param fromFile - the repo file it's in, from the root
 * @returns the target for the page
 * @throws when a relative link leaves the repo or names a missing file
 */
const siteLink = (target, fromFile) => {
    const hashIndex = target.indexOf('#');
    const href = hashIndex === -1 ? target : target.slice(0, hashIndex);
    const anchor = hashIndex === -1 ? '' : target.slice(hashIndex);
    if (href.startsWith(`${docsSite}/`)) {
        return target.slice(docsSite.length);
    }
    const npm = /^https:\/\/www\.npmjs\.com\/package\/(?<name>[^\/]+(?:\/[^\/]+)?)$/v.exec(href);
    if (npm && !anchor && npmPages.has(npm.groups.name)) {
        return npmPages.get(npm.groups.name);
    }
    const github = new RegExp(`^${githubRepo}/(?:blob|tree)/main/(?<path>.+?)/?$`, 'v').exec(href);
    const relative = href !== '' && !/^[a-z][a-z\d+.\-]*:|^\//iv.test(href);
    if (!github && !relative) {
        return target;
    }
    const repoPath = github
        ? github.groups.path
        : path.posix
              .normalize(path.posix.join(path.posix.dirname(fromFile), href))
              .replace(/\/$/v, '');
    if (repoPath.startsWith('../')) {
        throw new Error(`${fromFile}: link ${target} leaves the repository`);
    }
    const site = sitePages.get(repoPath);
    if (site && (!anchor || site.fromSource)) {
        return `${site.page}${anchor}`;
    }
    if (github) {
        return target;
    }
    if (existsSync(path.join(root, repoPath))) {
        const kind = statSync(path.join(root, repoPath)).isDirectory() ? 'tree' : 'blob';
        return `${githubRepo}/${kind}/main/${repoPath}${anchor}`;
    }
    // Absent only because CI leaves its directory out: GitHub redirects a blob URL of a directory
    if (excludedHere(repoPath)) {
        return `${githubRepo}/blob/main/${repoPath}${anchor}`;
    }
    throw new Error(`${fromFile}: link ${target} names a missing file`);
};

/**
 * Turns a repo Markdown file (a WHY file or a demo's README) into the body of its site page: links
 * are rewritten by `siteLink`, headings are moved `shift` levels down, and a twoslash comment,
 * hidden on GitHub and npm, becomes the setup of the code block under it. A twoslash comment is
 * exactly these lines, above a `ts` fence (blank lines between are fine), and indented like it
 * (in a list item, say):
 *
 * ```md
 * <!-- twoslash
 * declare const container: Container;
 * // @errors: 2554
 * -->
 * ```
 *
 * Its lines are compiled above `// ---cut---`, so they're checked but not shown, and directives
 * such as `// @errors` and `// @noErrors` apply to the block. Since the block itself is shown on
 * GitHub, a cut or a directive in it fails, as does any malformed twoslash comment.
 *
 * @param filePath - the file, from the root
 * @param shift - how many levels to move each heading down, for a file that is a section of a page
 * @returns the page's body
 * @throws on a malformed twoslash comment, a twoslash directive in a shown block, or a heading
 * moved below `######`
 */
const sitePage = (filePath, shift = 0) => {
    const lines = readFileSync(path.join(root, filePath), 'utf8').split('\n');
    const fail = (index, reason) => {
        throw new Error(`${filePath}:${index + 1}: ${reason}`);
    };
    const output = [];
    let fence = null;
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (fence) {
            output.push(line);
            if (line.trimStart().startsWith(fence.marker) && line.trim() === fence.marker) {
                fence = null;
            } else if (
                fence.language === 'ts' &&
                /^\s*\/\/\s*(?:-{3}cut|@(?:errors|noErrors|filename|showEmit)\b)/v.test(line)
            ) {
                fail(index, 'a twoslash directive belongs in a twoslash comment above the block');
            }
            continue;
        }
        const opening = /^(?<marker>`{3,}|~{3,})(?<language>\S*)/v.exec(line.trim());
        if (opening) {
            fence = opening.groups;
            output.push(line);
            continue;
        }
        const comment = /^(?<indent>\s*)<!--\s*twoslash/v.exec(line);
        if (comment) {
            const { indent } = comment.groups;
            if (line !== `${indent}<!-- twoslash`) {
                fail(index, 'a twoslash comment opens with a line that is exactly "<!-- twoslash"');
            }
            const setup = [];
            index++;
            for (; lines[index] !== `${indent}-->`; index++) {
                if (index >= lines.length) {
                    fail(index - 1, 'a twoslash comment closes with a line that is exactly "-->"');
                }
                if (lines[index].includes('-->')) {
                    fail(index, 'a twoslash comment closes with a line that is exactly "-->"');
                }
                setup.push(lines[index]);
            }
            // Biome puts a blank line between a comment and a fence in a list item
            while (lines[index + 1] === '') {
                index++;
            }
            if (lines[index + 1] !== `${indent}\`\`\`ts`) {
                fail(index + 1, 'a twoslash comment is followed by a ```ts fence');
            }
            index++;
            fence = { marker: '```', language: 'ts' };
            output.push(`${indent}\`\`\`ts`, ...setup, `${indent}// ---cut---`);
            continue;
        }
        const heading = /^(?<level>#{1,6})(?<rest> .*)?$/v.exec(line);
        const level = (heading?.groups.level.length ?? 0) + shift;
        if (heading && level > 6) {
            fail(index, `a heading can't move ${shift} level(s) down, below ######`);
        }
        output.push(
            (heading ? `${'#'.repeat(level)}${heading.groups.rest ?? ''}` : line)
                .split(/(`+[^`]*`+)/v)
                .map((part, partIndex) =>
                    partIndex % 2 === 1
                        ? part
                        : part.replaceAll(
                              /\]\((?<target>[^\)\s]+)\)/gv,
                              (_match, target) => `](${siteLink(target, filePath)})`
                          )
                )
                .join('')
        );
    }
    if (fence) {
        fail(lines.length - 1, 'a code block is never closed');
    }
    return output.join('\n');
};

/**
 * A page generated from repo files: the frontmatter, where only the `description` is written by
 * hand, then the body, formatted as Biome would.
 *
 * @param sources - the files it's generated from, from the root
 * @param body - the page's Markdown
 * @returns the page's content
 */
const generatedPage = (sources, body) => {
    const named = list(sources);
    return `---
${manualSection({ id: 'frontmatter', comment: { start: '#' }, body: 'description:' })}
---

<!-- ${signatureToken()} Generated from ${named} by docs/scripts/populate-docs.mjs (nx run @leyman/docs:populate-files). Edit ${named} instead, and the description only here. -->

${format(body)}
`;
};

/**
 * The `why` page of each documented package with a WHY file, which is the page's single source.
 * The page's `description` is its manual section. A package lists a `why` page exactly when one
 * of its sources has a WHY file.
 */
const whyPages = packages.flatMap(({ slug, sources, pages }) => {
    const files = sources.flatMap(source => whyFiles(source));
    const listed = pages.some(page => 'link' in page && page.link === 'why');
    const filePath = `docs/src/packages/${slug}/why.md`;
    if (files.length > 1) {
        throw new Error(`Package ${slug} has more than one WHY file: ${files.join(', ')}`);
    }
    if (listed !== (files.length === 1)) {
        throw new Error(
            listed
                ? `Package ${slug} lists a why page in projects.ts, but none of its sources has a WHY-*.md`
                : `Package ${slug} has ${files[0]}, but lists no why page in projects.ts`
        );
    }
    if (files.length === 0) {
        if (existsSync(path.join(root, filePath))) {
            throw new Error(`${filePath} has no WHY-*.md to be generated from: delete it`);
        }
        return [];
    }
    const [source] = files;
    return [{ filePath, content: () => generatedPage([source], sitePage(source)) }];
});

/**
 * Each demo's page, generated from its README, which is its single source, followed by a section
 * for each of its `readmes`. The README's title becomes the demo's, with `<ProjectHeader />` under
 * it, and each further README's title becomes the section's heading, with its headings moved one
 * level down. The page's `description` is its manual section.
 */
const demoPages = demos.map(({ slug, title, source, readmes = [] }) => {
    const readme = `${source}/README.md`;
    const withoutTitle = (filePath, shift) => {
        const [first, ...rest] = sitePage(filePath, shift).split('\n');
        if (!first.startsWith(`${'#'.repeat(shift + 1)} `)) {
            throw new Error(`${filePath}: the first line must be its title, a "# " heading`);
        }
        return rest.join('\n');
    };
    return {
        filePath: `docs/src/demos/${slug}/index.md`,
        content: () =>
            generatedPage(
                [readme, ...readmes.map(part => part.path)],
                [
                    `# ${title}\n\n<ProjectHeader />\n${withoutTitle(readme, 0)}`,
                    ...readmes.map(part => `## ${part.title}\n${withoutTitle(part.path, 1)}`),
                ].join('\n\n')
            ),
    };
});
const nestedReadmes = infrastructure.filter(entry => entry.readmes);
if (nestedReadmes.length > 0) {
    throw new Error(
        `Infrastructure pages are written by hand, so readmes does nothing: ${nestedReadmes.map(entry => entry.slug).join(', ')}`
    );
}

/**
 * A skill's `name` and `description`, from the frontmatter of its `SKILL.md`. Only plain one-line
 * values are read, which every skill here uses; anything else fails, rather than being misread.
 *
 * @param filePath - the `SKILL.md`, from the root
 * @returns its name and description
 * @throws when either is missing or not a plain one-line value
 */
const readSkill = filePath => {
    const frontmatter = /^---\n(?<yaml>.*?)\n---\n/sv.exec(
        readFileSync(path.join(root, filePath), 'utf8')
    )?.groups?.yaml;
    const field = key => {
        const value = new RegExp(`^${key}:(?<value>.*)$`, 'mv')
            .exec(frontmatter ?? '')
            ?.groups?.value.trim();
        if (!value || /^["'\|>]/v.test(value)) {
            throw new Error(`${filePath}: frontmatter needs a plain one-line ${key}`);
        }
        return value;
    };
    return { name: field('name'), description: field('description') };
};

const skillFiles = directory =>
    existsSync(path.join(root, directory))
        ? readdirSync(path.join(root, directory), { withFileTypes: true })
              .filter(entry => entry.isDirectory())
              .map(entry => path.posix.join(directory, entry.name, 'SKILL.md'))
              .filter(filePath => existsSync(path.join(root, filePath)))
        : [];

/**
 * Every skill an agent here can read: the repository's own (`.agents/skills`), those a package
 * ships (`<package>/skills`, which `leyman/main/scripts/link-skills.mjs` links into
 * `.agents/skills`), and those for working in one project (`<project>/.agents/skills`).
 * The links themselves are skipped, since their targets are listed as shipped; so is a directory
 * named as a shipped skill, which is what a link becomes in a copy that follows links.
 */
const skills = () => {
    const shipped = projects.flatMap(project =>
        skillFiles(`${project.directory}/skills`).map(filePath => ({
            ...readSkill(filePath),
            filePath,
            source: `shipped by ${code(project.npmName ?? project.name)}`,
        }))
    );
    const shippedNames = new Set(shipped.map(skill => skill.name));
    const own = skillFiles('.agents/skills')
        .filter(filePath => !shippedNames.has(path.basename(path.dirname(filePath))))
        .map(filePath => ({ ...readSkill(filePath), filePath, source: 'this repository' }));
    const scoped = projects.flatMap(project =>
        skillFiles(`${project.directory}/.agents/skills`).map(filePath => ({
            ...readSkill(filePath),
            filePath,
            source: `${code(project.directory)}'s own`,
        }))
    );
    return [...own, ...shipped, ...scoped].toSorted(
        (a, b) => byName(a.name, b.name) || byName(a.filePath, b.filePath)
    );
};

const agentsGuide = () => {
    const filePath = 'AGENTS.md';
    return `${header()}

${manual(filePath, 'intro')}

## Skills

${manual(filePath, 'skills')}

${table(
    ['Skill', 'What it covers', 'Source'],
    skills().map(skill => [
        `[${code(skill.name)}](./${skill.filePath})`,
        skill.description,
        skill.source,
    ])
)}
`;
};

const files = [
    { filePath: 'AGENTS.md', content: agentsGuide },
    { filePath: 'README.md', content: readme },
    { filePath: 'docs/README.md', content: docsReadme },
    { filePath: '.agents/skills/projects/SKILL.md', content: projectsSkill },
    { filePath: '.agents/skills/docs-site/SKILL.md', content: docsSiteSkill },
    { filePath: '.claude/rules/docs-site-sync.md', content: docsSiteRule },
    { filePath: 'leyman/configs/skills/principles/SKILL.md', content: principlesSkill },
    {
        filePath: '.github/ISSUE_TEMPLATE/bug_report.yml',
        content: issueTemplate(
            '.github/ISSUE_TEMPLATE/bug_report.yml',
            'Which package is affected?'
        ),
    },
    {
        filePath: '.github/ISSUE_TEMPLATE/feature_request.yml',
        content: issueTemplate(
            '.github/ISSUE_TEMPLATE/feature_request.yml',
            'Which package is this for?'
        ),
    },
    ...whyPages,
    ...demoPages,
];
const results = await populateFiles(
    files
        .filter(({ filePath }) => !excludedHere(filePath))
        .map(({ filePath, content }) => ({ filePath, content: content(), signed: true })),
    { cwd: root, force }
);
for (const result of results) {
    if (result.updated) {
        console.log(`Wrote ${path.relative(root, result.filePath)} (${result.reason})`);
    }
}
const undescribed = [...whyPages, ...demoPages]
    .map(({ filePath }) => filePath)
    .filter(filePath =>
        /^description:\s*$/mv.test(readFileSync(path.join(root, filePath), 'utf8'))
    );
if (undescribed.length > 0) {
    throw new Error(`Fill in the description in the frontmatter of ${undescribed.join(', ')}`);
}

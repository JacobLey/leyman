/**
 * Generates the package lists that docs repeat: the README's package and demo tables, the
 * projects skill's tables, the docs-site skill's tables, `docs/README.md`'s list of documented
 * packages, the paths of the docs-site rule, and the package dropdowns of the issue templates.
 * Also the principles skill `@leyman/configs` ships, from the principles page.
 *
 * Data comes from each project's `package.json` (or `project.json` `metadata.description` for a
 * project with none) and from `docs/.vitepress/projects.ts`. Prose lives in manual sections, kept
 * across runs. Files are signed, so an edit outside a manual section fails the next run; in CI
 * (`CI` set) a file that would change fails it. `--force` overwrites edited or unsigned files.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
 * absent is skipped rather than reported missing; any full checkout still generates and checks it.
 */
const ciExcluded = ['.agents', '.claude', '.github', 'README.md'];
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

const files = [
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

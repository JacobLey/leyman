// Applies `fork-manifest.json`: copies what a fork takes into a directory, and cuts the shared configs down to it. Also
// imported by `check-fork-manifest.mjs`, which inspects the result on every run, and by `audit-fork-manifest.mjs`.
//
//   node fork-manifest.mjs apply --to <dir> [--with go,rust,...] [--package <path>]...
//   node fork-manifest.mjs drift --fork <dir>
//   node fork-manifest.mjs resync --fork <dir>
//   node fork-manifest.mjs render
//
// `apply` records in the fork's `leyman-upstream.json` the commit it copied from and what it took. `drift`, run from an
// up-to-date checkout, reports what changed upstream in those files since then, and `resync` records that the fork has
// caught up. Neither compares the fork's files with this repository's: a fork keeps its own values (versions, images,
// names), so only upstream's changes are news.
//
// Has no dependencies, because CI's `test` job runs it straight from the checkout, with no `node_modules`.

import { execFileSync } from 'node:child_process';
import {
    copyFileSync,
    existsSync,
    lstatSync,
    mkdirSync,
    readFileSync,
    readlinkSync,
    realpathSync,
    rmSync,
    statSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

export const workspaceRoot = path.resolve(import.meta.dirname, '../../..');

const dependencyFields = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
];

export const readManifest = () =>
    JSON.parse(readFileSync(path.join(import.meta.dirname, '../fork-manifest.json'), 'utf8'));

export const covers = (classified, file) =>
    file === classified || file.startsWith(`${classified}/`);

// What Git would commit: tracked files that still exist, and new ones that aren't ignored
export const listFiles = () =>
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- the checkout's own Git, in a script run by hand or CI
    execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
        cwd: workspaceRoot,
        encoding: 'utf8',
    })
        .split('\0')
        .filter(file => file !== '' && existsSync(path.join(workspaceRoot, file)));

// Some configs open with a comment on its own line
const readJson = file =>
    JSON.parse(
        readFileSync(file, 'utf8')
            .split('\n')
            .filter(line => !line.trimStart().startsWith('//'))
            .join('\n')
    );
const writeJson = (file, data) => {
    writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
};

const without = (object, names) =>
    Object.fromEntries(Object.entries(object).filter(([name]) => !names.has(name)));

const packageJsons = files => files.filter(file => path.basename(file) === 'package.json');

const dependencyRanges = packageJson =>
    dependencyFields.flatMap(field =>
        Object.entries(packageJson[field] ?? {}).map(([name, range]) => ({ field, name, range }))
    );

const copyFile = (file, to) => {
    const source = path.join(workspaceRoot, file);
    const target = path.join(to, file);
    mkdirSync(path.dirname(target), { recursive: true });
    if (lstatSync(source).isSymbolicLink()) {
        symlinkSync(readlinkSync(source), target);
    } else {
        copyFileSync(source, target);
    }
};

// A kept target that names an unrequested condition's target must not keep waiting for it
const stripNxJson = ({ nx }, requested, to) => {
    const file = path.join(to, 'nx.json');
    const nxJson = readJson(file);
    const unrequested = group =>
        Object.entries(group)
            .filter(([condition]) => !requested.has(condition))
            .flatMap(([, names]) => names);
    const targets = new Set([...unrequested(nx.targets), ...nx.repoOnlyTargets]);
    const plugins = new Set(unrequested(nx.plugins));

    nxJson.plugins = nxJson.plugins.filter(plugin => !plugins.has(plugin.plugin ?? plugin));
    // The package generator's defaults name this repository and its owner, which a fork sets for itself
    const packageDefaults = nxJson.generators?.['@leyman/nx-plugin']?.package;
    if (packageDefaults) {
        delete packageDefaults.repository;
        delete packageDefaults.author;
    }
    nxJson.namedInputs = without(nxJson.namedInputs, new Set(unrequested(nx.namedInputs)));
    nxJson.targetDefaults = Object.fromEntries(
        Object.entries(without(nxJson.targetDefaults, targets)).map(([name, target]) => [
            name,
            target.dependsOn
                ? {
                      ...target,
                      dependsOn: target.dependsOn.filter(dependency => !targets.has(dependency)),
                  }
                : target,
        ])
    );
    writeJson(file, nxJson);

    const lifecycleFile = path.join(to, 'leyman/main/lifecycle.json');
    const lifecycle = readJson(lifecycleFile);
    writeJson(lifecycleFile, { ...lifecycle, bindings: without(lifecycle.bindings, targets) });

    // The plugin writes the targets it infers back into nx.json, so a cut one must be off there too
    const pluginFile = path.join(to, 'leyman/main/nx-plugin.json');
    const pluginOptions = readJson(pluginFile);
    // Read from the plugin's committed options schema, since this runs before anything is installed
    const targetNames = Object.keys(
        readJson(path.join(workspaceRoot, 'leyman/nx-plugin/out/schema.json')).properties.targets
            .properties
    );
    const cutPluginTargets = targetNames.filter(name => targets.has(name));
    writeJson(pluginFile, {
        ...pluginOptions,
        targets: {
            ...pluginOptions.targets,
            ...Object.fromEntries(cutPluginTargets.map(name => [name, false])),
        },
    });

    const projectFile = path.join(to, 'leyman/main/project.json');
    const project = readJson(projectFile);
    const projectTargets = new Set([...targets, ...nx.repoOnlyProjectTargets]);
    writeJson(projectFile, { ...project, targets: without(project.targets, projectTargets) });
};

const workspaceVersions = files =>
    new Map(
        packageJsons(files)
            .map(file => readJson(path.join(workspaceRoot, file)))
            .map(({ name, version }) => [name, version])
    );

// What the fork doesn't take comes from npm. Any release of this major, not this repo's exact version, since a release
// from this week isn't old enough for the fork's own `minimumReleaseAge`
const npmRange = version => {
    const [major, minor] = version.split('.', 2);
    return major === '0' ? `^0.${minor}.0` : `^${major}.0.0`;
};

const pointAtNpm = (files, to) => {
    const copied = packageJsons(files);
    const taken = new Set(copied.map(file => readJson(path.join(to, file)).name));
    const versions = workspaceVersions(listFiles());
    for (const file of copied) {
        const target = path.join(to, file);
        const packageJson = readJson(target);
        const external = dependencyRanges(packageJson).filter(
            ({ name, range }) => range.startsWith('workspace:') && !taken.has(name)
        );
        for (const { field, name } of external) {
            packageJson[field][name] = npmRange(versions.get(name));
        }
        writeJson(target, packageJson);
    }
};

// The plugin's defaults for what its options point at in this repo: the shared configs and its scripts, installed
const npmToolInputs = {
    configs: [{ externalDependencies: ['@leyman/configs'] }],
    tools: [{ externalDependencies: ['@leyman/nx-plugin'] }],
    checkPackage: [{ externalDependencies: ['@leyman/check-package', 'typescript'] }],
};

// Replaces each run of `run` in `array` (compared as JSON) with `replacement`
const replaceRuns = (array, run, replacement) => {
    const key = JSON.stringify;
    const result = [];
    for (let i = 0; i < array.length; ) {
        if (run.length > 0 && key(array.slice(i, i + run.length)) === key(run)) {
            result.push(...replacement);
            i += run.length;
        } else {
            result.push(array[i]);
            i++;
        }
    }
    return result;
};

// A fork installs the shared configs and the Nx plugin from npm instead of copying them: what points into their
// folders here points at the installed packages there, and nx.json holds what the plugin generates from that
const installTools = (files, to) => {
    const pluginFile = path.join(to, 'leyman/main/nx-plugin.json');
    const { scripts, inputs: toolInputs = {}, ...pluginOptions } = readJson(pluginFile);
    const { inputs: checkPackageInputs, ...checkPackage } = pluginOptions.checkPackage ?? {};
    const inputs = { ...toolInputs, checkPackage: checkPackageInputs };
    // Projects the fork doesn't have can't get or skip a target
    const inFork = root => existsSync(path.join(to, root));
    const targets = Object.fromEntries(
        Object.entries(pluginOptions.targets ?? {}).map(([name, target]) => {
            if (target === false) {
                return [name, target];
            }
            const kept = Object.fromEntries(
                Object.entries(target)
                    .map(([key, value]) => [
                        key,
                        Array.isArray(value) ? value.filter(root => inFork(root)) : value,
                    ])
                    .filter(([, value]) => !Array.isArray(value) || value.length > 0)
            );
            return [name, kept];
        })
    );
    writeJson(pluginFile, {
        ...pluginOptions,
        targets: Object.fromEntries(
            Object.entries(targets).filter(
                ([, target]) => target === false || Object.keys(target).length > 0
            )
        ),
        checkPackage,
    });

    const nxFile = path.join(to, 'nx.json');
    let nxJson = readJson(nxFile);
    const replaceInputs = list => {
        let current = list;
        for (const [name, replacement] of Object.entries(npmToolInputs)) {
            current = replaceRuns(current, inputs[name] ?? [], replacement);
        }
        return current;
    };
    nxJson.namedInputs = Object.fromEntries(
        Object.entries(nxJson.namedInputs).map(([name, list]) => [name, replaceInputs(list)])
    );
    nxJson.targetDefaults = Object.fromEntries(
        Object.entries(nxJson.targetDefaults).map(([name, target]) => [
            name,
            target.inputs ? { ...target, inputs: replaceInputs(target.inputs) } : target,
        ])
    );
    if (scripts) {
        // Each script runs as the bin the package names it by
        const { bin } = readJson(path.join(workspaceRoot, 'leyman/nx-plugin/package.json'));
        let text = JSON.stringify(nxJson);
        for (const [name, file] of Object.entries(bin)) {
            text = text.replaceAll(`${scripts}/${path.posix.basename(file)}`, () => name);
        }
        nxJson = JSON.parse(text);
    }
    writeJson(nxFile, nxJson);

    // A target can't wait on a project the fork installs instead, such as building check-package before running it
    const copied = packageJsons(files).map(file => readJson(path.join(to, file)));
    const names = new Set(copied.map(({ name }) => name));
    const forkedNxJson = readJson(nxFile);
    forkedNxJson.targetDefaults = Object.fromEntries(
        Object.entries(forkedNxJson.targetDefaults).map(([name, target]) => [
            name,
            target.dependsOn
                ? {
                      ...target,
                      dependsOn: target.dependsOn.filter(
                          dependency => !dependency.projects?.every(project => !names.has(project))
                      ),
                  }
                : target,
        ])
    );
    writeJson(nxFile, forkedNxJson);

    // Only a package another one depends on gets `sync-injected`, and the packages that depended on some here are on npm
    const dependedOn = new Set(
        copied.flatMap(packageJson => dependencyRanges(packageJson).map(({ name }) => name))
    );
    const undepended = packageJsons(files)
        .filter(file => !dependedOn.has(readJson(path.join(to, file)).name))
        .map(file => path.join(to, path.dirname(file), 'project.json'))
        .filter(projectFile => existsSync(projectFile))
        .filter(projectFile => readJson(projectFile).targets?.['sync-injected']);
    for (const projectFile of undepended) {
        const project = readJson(projectFile);
        delete project.targets['sync-injected'];
        writeJson(projectFile, project);
    }

    for (const file of ['biome.json', 'tsconfig.json']) {
        const target = path.join(to, file);
        writeFileSync(
            target,
            readFileSync(target, 'utf8').replaceAll(
                './leyman/configs/',
                './leyman/main/node_modules/@leyman/configs/'
            )
        );
    }
};

// Nx's sync generator fills in `references` from each package's dependencies, once there are dependencies to read
const dropMissingReferences = (files, to) => {
    const tsconfigs = files.filter(file => path.basename(file) === 'tsconfig.json');
    for (const file of tsconfigs) {
        const target = path.join(to, file);
        const tsconfig = readJson(target);
        if (!tsconfig.references) {
            continue;
        }

        tsconfig.references = tsconfig.references.filter(reference =>
            existsSync(path.join(path.dirname(target), reference.path))
        );
        writeJson(target, tsconfig);
    }
};

const catalogReferences = (files, to) => {
    const references = new Map();
    const ranges = packageJsons(files).flatMap(file =>
        dependencyRanges(readJson(path.join(to, file)))
    );
    const fromCatalogs = ranges.filter(({ range }) => range.startsWith('catalog:'));
    for (const { name, range } of fromCatalogs) {
        const catalog = range.slice('catalog:'.length);
        references.set(catalog, new Set([...(references.get(catalog) ?? []), name]));
    }
    return references;
};

const entryName = line => /^\s*'?(?<name>[^\s':][^':]*)'?:/v.exec(line)?.groups?.name;

// Line by line, to keep the file's comments. Everything cut here is one line, under the comments that explain it
const pruneWorkspaceYaml = ({ workspaceGlobs }, files, to) => {
    const file = path.join(to, 'pnpm-workspace.yaml');
    const references = catalogReferences(files, to);
    const globs = new Set(workspaceGlobs);
    const output = [];
    let section = '';
    let catalog = '';
    let comments = [];
    let catalogHeader = [];
    let hasCatalogs = false;
    let patchesHeader = [];

    for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (/^\S/v.test(line) && !line.startsWith('#')) {
            section = line.slice(0, line.indexOf(':'));
        }
        if (line.trimStart().startsWith('#')) {
            comments.push(line);
        } else if (section === 'packages' && line.startsWith('  - ')) {
            const glob = line.slice('  - '.length).replaceAll("'", '');
            if (globs.has(glob) || glob.startsWith('!')) {
                output.push(...comments, line);
            }
            comments = [];
        } else if (section === 'catalog' && line.startsWith('  ')) {
            if (references.get('')?.has(entryName(line))) {
                output.push(...comments, line);
            }
            comments = [];
        } else if (line === 'patchedDependencies:') {
            // Written with the first patch kept
            patchesHeader = [...comments, line];
            comments = [];
        } else if (section === 'patchedDependencies' && line.startsWith('  ')) {
            // A patch only applies to what the fork installs directly: a dependency of a package it takes from npm
            // resolves by that package's own range
            const entry = entryName(line);
            const name = entry.slice(0, entry.lastIndexOf('@'));
            const patch = line.slice(line.lastIndexOf(': ') + ': '.length).trim();
            if (references.values().some(names => names.has(name))) {
                output.push(...patchesHeader, ...comments, line);
                patchesHeader = [];
            } else {
                rmSync(path.join(to, patch));
                files.splice(files.indexOf(patch), 1);
            }
            comments = [];
        } else if (section === 'catalogs') {
            if (/^ {2}\S/v.test(line)) {
                catalog = entryName(line);
                catalogHeader = [...comments, line];
            } else if (references.get(catalog)?.has(entryName(line))) {
                output.push(...(hasCatalogs ? [] : ['catalogs:']), ...catalogHeader, line);
                hasCatalogs = true;
                catalogHeader = [];
            }
            comments = [];
        } else {
            output.push(...comments, line);
            comments = [];
        }
    }
    writeFileSync(file, output.join('\n'));
};

// The devcontainer's user, compose service and display name say `leyman`. A fork takes its own repository's name, so
// its container isn't named after this one. Each replacement must match, so a rewording here fails `apply` loudly.

// Linux user names are at most 32 characters
const maxUsername = 32;

/**
 * The name a fork's devcontainer takes: its folder's name, as a Linux user name and compose service name.
 *
 * @param to - the fork's folder
 * @returns lower-case letters, digits and single dashes, starting with a letter, `dev` if nothing is left
 */
export const devcontainerName = to => {
    const words =
        path
            .basename(path.resolve(to))
            .toLowerCase()
            .match(/[\da-z]+/gv) ?? [];
    const name = words
        .join('-')
        .replace(/^[\d\-]+/v, '')
        .slice(0, maxUsername);
    const trimmed = name.endsWith('-') ? name.slice(0, -1) : name;
    return trimmed || 'dev';
};

const devcontainerRenames = name => ({
    '.devcontainer/Dockerfile': [['ARG USER=leyman\n', `ARG USER=${name}\n`]],
    '.devcontainer/devcontainer.json': [
        ['"name": "Leyman",', `"name": ${JSON.stringify(name)},`],
        ['"service": "leyman",', `"service": ${JSON.stringify(name)},`],
        ['"remoteUser": "leyman",', `"remoteUser": ${JSON.stringify(name)},`],
    ],
    '.devcontainer/docker-compose.yml': [
        ['\nservices:\n  leyman:\n', `\nservices:\n  ${name}:\n`],
        ["every worktree's service is `leyman`.", `every worktree's service is \`${name}\`.`],
    ],
});

const renameDevcontainer = (files, to) => {
    const name = devcontainerName(to);
    const renames = Object.entries(devcontainerRenames(name));
    for (const [file, replacements] of renames) {
        if (!files.includes(file)) {
            continue;
        }
        const target = path.join(to, file);
        let text = readFileSync(target, 'utf8');
        for (const [from, replacement] of replacements) {
            if (!text.includes(from)) {
                throw new Error(
                    `${file} no longer has ${JSON.stringify(from)}: update devcontainerRenames`
                );
            }
            text = text.replace(from, () => replacement);
        }
        writeFileSync(target, text);
    }
};

/**
 * Where a fork records what it took from this repository, and from which commit.
 */
export const upstreamFile = 'leyman-upstream.json';

const upstreamRepository = 'https://github.com/JacobLey/leyman';

const mainReadme = 'leyman/main/README.md';
const scriptsHeading = '## Scripts\n\n';
const scriptRowPattern = /^\| \[`[^`]+`\]\(\.\/scripts\/(?<script>[^\)]+)\)/v;

// The tools package's README lists its scripts, most of which check this repository's own setup (the fork manifest
// among them) and stay here. A fork's copy lists only the scripts it took, and says where the rest went. Each part must
// still match, so a rewording here fails `apply` instead of leaving the list half cut.
const rewriteMainReadme = (files, to) => {
    if (!files.includes(mainReadme)) {
        return;
    }
    const target = path.join(to, mainReadme);
    const text = readFileSync(target, 'utf8');
    const lines = text.split('\n');
    const rows = lines.filter(line => scriptRowPattern.test(line));
    if (!text.includes(scriptsHeading) || rows.length === 0) {
        throw new Error(
            `${mainReadme} no longer has a "## Scripts" table of ./scripts links: update rewriteMainReadme`
        );
    }
    const isTaken = row =>
        existsSync(path.join(to, 'leyman/main/scripts', scriptRowPattern.exec(row).groups.script));
    const header = lines.findIndex(line => line === '| Script' || line.startsWith('| Script '));
    const kept = lines.filter(line => !scriptRowPattern.test(line) || isTaken(line));
    const hasRows = rows.some(row => isTaken(row));
    const withoutTable = hasRows
        ? kept
        : kept.filter((_line, index) => index !== header && index !== header + 1);
    const note = [
        `This repository was started from [leyman](${upstreamRepository})'s fork manifest. The manifest, and the scripts that apply and check it, stay in leyman: \`${upstreamFile}\` records what was taken and from which commit, and from a checkout of leyman \`node leyman/main/scripts/fork-manifest.mjs drift --fork <this repository>\` lists what changed upstream since.`,
        ...(hasRows ? ['', 'The scripts this repository took:', '', ''] : ['']),
    ].join('\n');
    writeFileSync(target, withoutTable.join('\n').replace(scriptsHeading, () => scriptsHeading + note));
};

const fencePattern = /^ {0,3}(?:`{3}|~{3})/v;
const inlineCodePattern = /`[^\n`]+`/gv;
const linkPattern = /\]\((?<target>[^\s\)]+)(?<title> "[^\n"]*")?\)/gv;

/**
 * Rewrites each of Markdown's inline links outside code: fenced blocks and inline spans are left alone.
 *
 * @param text - Markdown
 * @param replace - given each link's target, returns the target to write
 * @returns the text with each link replaced
 */
const mapLinks = (text, replace) => {
    let isFenced = false;
    return text
        .split('\n')
        .map(line => {
            if (fencePattern.test(line)) {
                isFenced = !isFenced;
            }
            if (isFenced) {
                return line;
            }
            // Blanked to the same length, so a link's index still points into the line
            const blanked = line.replaceAll(inlineCodePattern, code => ' '.repeat(code.length));
            let mapped = '';
            let from = 0;
            for (const { groups, index } of blanked.matchAll(linkPattern)) {
                mapped += `${line.slice(from, index)}](${replace(groups.target)}${groups.title ?? ''})`;
                from = index + `](${groups.target}${groups.title ?? ''})`.length;
            }
            return mapped + line.slice(from);
        })
        .join('\n');
};

const isRelativeLink = target => !/^(?:[a-z][\d+\-.a-z]*:|#|\/)/iv.test(target);

/**
 * Where a relative link in a file points, from the workspace's root.
 *
 * @param file - the file the link is in
 * @param target - the link, which may end in an anchor
 * @returns the path, and the anchor with its `#` (or empty)
 */
const resolveLink = (file, target) => {
    const hash = target.indexOf('#');
    const linked = hash === -1 ? target : target.slice(0, hash);
    return {
        anchor: hash === -1 ? '' : target.slice(hash),
        resolved: linked === '' ? file : path.posix.join(path.posix.dirname(file), decodeURI(linked)),
    };
};

const markdownFiles = files => files.filter(file => file.endsWith('.md'));

// A copied file may link to what a fork doesn't take: an example in a package this repository publishes, or a skill
// for a condition the fork didn't ask for. In the fork, such a link points at this repository on GitHub, so it still
// leads somewhere, while the link here stays relative and current. Followed through symlinks, which GitHub doesn't
// resolve in a URL, and only to what Git would commit, which is all that GitHub has.
const pointLinksUpstream = (files, to) => {
    const committed = listFiles();
    const isCommitted = file => committed.some(committedFile => covers(file, committedFile));
    const upstreamUrl = (file, link) => {
        if (!isRelativeLink(link)) {
            return link;
        }
        const { anchor, resolved } = resolveLink(file, link);
        const source = path.join(workspaceRoot, resolved);
        if (existsSync(path.join(to, resolved)) || !existsSync(source)) {
            return link;
        }
        const real = path.relative(workspaceRoot, realpathSync(source)).split(path.sep).join('/');
        if (real.startsWith('..') || !isCommitted(real)) {
            return link;
        }
        const kind = statSync(source).isDirectory() ? 'tree' : 'blob';
        return `${upstreamRepository}/${kind}/main/${real}${anchor}`;
    };
    for (const file of markdownFiles(files)) {
        const target = path.join(to, file);
        writeFileSync(
            target,
            mapLinks(readFileSync(target, 'utf8'), link => upstreamUrl(file, link))
        );
    }
};

const git = (...args) =>
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- the checkout's own Git, in a script run by hand or CI
    execFileSync('git', args, { cwd: workspaceRoot, encoding: 'utf8' });

const headCommit = () => git('rev-parse', 'HEAD').trim();

const shortCommit = commit => git('rev-parse', '--short', commit).trim();

const writeUpstream = (to, { commit, conditions, extraPackages, files }) => {
    writeJson(path.join(to, upstreamFile), {
        $comment:
            'What this repository took from leyman, and the commit it was taken at. From a checkout of leyman, `node leyman/main/scripts/fork-manifest.mjs drift --fork <this repository>` lists what changed upstream since, and `resync` records that it has caught up.',
        repository: upstreamRepository,
        with: conditions,
        packages: extraPackages,
        files: files.toSorted((a, b) => a.localeCompare(b)),
        commit,
    });
};

const readUpstream = fork => {
    const file = path.join(fork, upstreamFile);
    if (!existsSync(file)) {
        throw new Error(`No ${upstreamFile} in ${fork}: apply the manifest to it first`);
    }
    return readJson(file);
};

/**
 * Copies what a fork with these conditions takes, and cuts the shared configs down to it.
 *
 * @param options - required
 * @param options.conditions - condition tags the fork asks for
 * @param options.extraPackages - workspace packages to bring along, as paths
 * @param options.to - directory to write to
 * @returns what was copied and what was skipped, with the reason
 * @throws {Error} for a condition the manifest doesn't list
 */
export const apply = ({ conditions = [], extraPackages = [], to }) => {
    const commit = headCommit();
    const manifest = readManifest();
    const unknown = conditions.filter(condition => !Object.hasOwn(manifest.conditions, condition));
    if (unknown.length > 0) {
        throw new Error(`Unknown conditions: ${unknown.join(', ')}`);
    }
    const requested = new Set(conditions);
    const candidates = [...manifest.entries, ...manifest.packages];
    const taken = candidates.filter(({ when }) => when === undefined || requested.has(when));
    const skipped = candidates.filter(({ when }) => when !== undefined && !requested.has(when));
    const paths = [...taken.map(entry => entry.path), ...extraPackages];

    const files = listFiles().filter(file => paths.some(entryPath => covers(entryPath, file)));
    for (const file of files) {
        copyFile(file, to);
    }
    stripNxJson(manifest, requested, to);
    pointAtNpm(files, to);
    installTools(files, to);
    dropMissingReferences(files, to);
    pruneWorkspaceYaml(manifest, files, to);
    renameDevcontainer(files, to);
    rewriteMainReadme(files, to);
    pointLinksUpstream(files, to);
    writeUpstream(to, { commit, conditions, extraPackages, files });
    return { files, skipped, taken };
};

/**
 * The files the manifest gives a fork with these options at the checkout's commit, committed ones only.
 *
 * @param upstream - the fork's record
 * @returns each path
 */
const currentFiles = ({ with: conditions, packages }) => {
    const manifest = readManifest();
    const requested = new Set(conditions);
    const paths = [
        ...[...manifest.entries, ...manifest.packages]
            .filter(({ when }) => when === undefined || requested.has(when))
            .map(entry => entry.path),
        ...packages,
    ];
    return git('ls-files', '-z')
        .split('\0')
        .filter(file => file !== '' && paths.some(entryPath => covers(entryPath, file)));
};

/**
 * What changed upstream, in the files a fork took, since the commit it took them at.
 *
 * @param fork - the fork's root
 * @returns the commit, each changed or removed file with the commits that touched it, and each new file
 * @throws {Error} when the fork has no record, or this checkout lacks its commit
 */
export const drift = fork => {
    const upstream = readUpstream(fork);
    try {
        git('cat-file', '-t', upstream.commit);
    } catch (error) {
        throw new Error(
            `This checkout doesn't have ${upstream.commit}: fetch leyman's full history (git fetch --unshallow)`,
            { cause: error }
        );
    }
    const head = headCommit();
    const current = currentFiles(upstream);
    const taken = new Set(upstream.files);
    // New since the fork's commit, so not a file it was given and dropped (a patch for a plugin it doesn't use)
    const created = new Set(
        git('diff', '--name-only', '--no-renames', '--diff-filter=A', '-z', upstream.commit, head)
            .split('\0')
            .filter(file => file !== '')
    );
    const changed = upstream.files
        .map(file => ({
            file,
            removed: !current.includes(file),
            commits: git('log', '--format=%h %s', `${upstream.commit}..${head}`, '--', file)
                .split('\n')
                .filter(line => line !== ''),
        }))
        .filter(({ commits }) => commits.length > 0);
    return {
        from: shortCommit(upstream.commit),
        to: shortCommit(head),
        added: current.filter(file => created.has(file) && !taken.has(file)),
        changed,
    };
};

/**
 * Records that a fork has caught up with the checkout: its commit, and the files it now has of what the manifest gives
 * it.
 *
 * @param fork - the fork's root
 * @returns the commits it moved between
 */
export const resync = fork => {
    const upstream = readUpstream(fork);
    const current = currentFiles(upstream);
    const commit = headCommit();
    writeUpstream(fork, {
        commit,
        conditions: upstream.with,
        extraPackages: upstream.packages,
        files: current.filter(file => existsSync(path.join(fork, file))),
    });
    return { from: shortCommit(upstream.commit), to: shortCommit(commit) };
};

const printDrift = ({ from, to, changed, added }) => {
    if (changed.length === 0 && added.length === 0) {
        console.log(`Nothing upstream changed in what the fork took, from ${from} to ${to}`);
        return;
    }
    console.log(`Upstream changes from ${from} to ${to}, in what the fork took:`);
    for (const { file, removed, commits } of changed) {
        console.log(`\n${file}${removed ? ' (removed or moved upstream)' : ''}`);
        for (const commit of commits) {
            console.log(`  ${commit}`);
        }
    }
    if (added.length > 0) {
        console.log('\nNew upstream, in what the fork takes:');
        for (const file of added) {
            console.log(`  ${file}`);
        }
    }
    console.log(
        `\nRead a change with \`git diff ${from} ${to} -- <file>\`, apply what fits the fork, then \`resync\`.`
    );
};

const skillFile = path.join(workspaceRoot, '.agents/skills/fork-manifest/SKILL.md');
const skillStart = '<!-- fork-manifest:start -->';
const skillEnd = '<!-- fork-manifest:end -->';

const table = (heading, rows) => [
    `### ${heading}`,
    '',
    '| Path | Why |',
    '|------|-----|',
    ...rows.map(({ path: entryPath, why }) => `| \`${entryPath}\` | ${why} |`),
    '',
];

/**
 * The skill's text, with its table generated from the manifest.
 *
 * @returns the whole file
 */
export const renderSkill = () => {
    const { conditions, entries, packages, repoOnly } = readManifest();
    const candidates = [...entries, ...packages];
    const text = readFileSync(skillFile, 'utf8');
    const lines = [
        ...table(
            'Every fork',
            candidates.filter(({ when }) => when === undefined)
        ),
        ...Object.entries(conditions)
            .filter(([condition]) => candidates.some(({ when }) => when === condition))
            .flatMap(([condition, description]) =>
                table(
                    `\`${condition}\`: ${description}`,
                    candidates.filter(({ when }) => when === condition)
                )
            ),
        ...table('Stays in this repo', repoOnly),
    ];
    return [
        text.slice(0, text.indexOf(skillStart) + skillStart.length),
        ...lines,
        text.slice(text.indexOf(skillEnd)),
    ].join('\n');
};

export const readSkill = () => readFileSync(skillFile, 'utf8');

const dependsOnProblems = ({ targetDefaults }) =>
    Object.entries(targetDefaults).flatMap(([name, { dependsOn = [] }]) =>
        dependsOn
            .filter(dependency => typeof dependency === 'string')
            .map(dependency => dependency.replace(/^\^/v, ''))
            .filter(dependency => !Object.hasOwn(targetDefaults, dependency))
            .map(dependency => `nx.json ${name}: depends on missing target ${dependency}`)
    );

const workspacePaths = text =>
    text
        .matchAll(/(?:\$\{NX_WORKSPACE_ROOT\}|\{workspaceRoot\})\/(?<file>[\w\-.\/]+)/gv)
        .map(({ groups }) => groups.file)
        .toArray();

const targetFileProblems = ({ targetDefaults }, to) =>
    Object.entries(targetDefaults).flatMap(([name, target]) =>
        workspacePaths(
            JSON.stringify([
                target.options?.commands ?? [],
                (target.inputs ?? []).filter(
                    input => typeof input === 'string' && !input.includes('*')
                ),
            ])
        )
            .filter(file => !existsSync(path.join(to, file)))
            .map(file => `nx.json ${name}: names ${file}, which the fork doesn't have`)
    );

const namedInputProblems = ({ targetDefaults }, stripped) =>
    Object.entries(targetDefaults).flatMap(([name, { inputs = [] }]) =>
        inputs
            .filter(input => typeof input === 'string')
            .map(input => input.replace(/^\^/v, ''))
            .filter(input => stripped.has(input))
            .map(input => `nx.json ${name}: uses stripped input ${input}`)
    );

const pluginProblems = ({ plugins = [] }, to) =>
    plugins
        .map(plugin => plugin.plugin ?? plugin)
        .filter(plugin => plugin.startsWith('.') && !existsSync(path.join(to, plugin)))
        .map(plugin => `nx.json plugin ${plugin}: missing`);

const bindingProblems = ({ targetDefaults }, to) => {
    const { bindings } = readJson(path.join(to, 'leyman/main/lifecycle.json'));
    return Object.keys(bindings)
        .filter(name => !Object.hasOwn(targetDefaults, name))
        .map(name => `lifecycle.json: binds ${name}, which has no target default`);
};

const projectTargetProblems = ({ targetDefaults }, to) => {
    const { targets } = readJson(path.join(to, 'leyman/main/project.json'));
    return Object.entries(targets)
        .filter(
            ([name, target]) =>
                !Object.hasOwn(targetDefaults, name) && Object.keys(target).length === 0
        )
        .map(([name]) => `leyman/main/project.json: ${name} has no definition`);
};

const catalogProblems = (files, to) => {
    const text = readFileSync(path.join(to, 'pnpm-workspace.yaml'), 'utf8');
    const problems = [];
    for (const [catalog, names] of catalogReferences(files, to)) {
        for (const name of names) {
            const listed = text
                .split('\n')
                .some(line => /^\s/v.test(line) && entryName(line) === name);
            if (!listed) {
                problems.push(
                    `pnpm-workspace.yaml: no ${catalog || 'default'} catalog entry for ${name}`
                );
            }
        }
    }
    return problems;
};

const patchProblems = to =>
    readFileSync(path.join(to, 'pnpm-workspace.yaml'), 'utf8')
        .matchAll(/: (?<patch>patches\/\S+)$/gmv)
        .map(({ groups }) => groups.patch)
        .filter(patch => !existsSync(path.join(to, patch)))
        .map(patch => `pnpm-workspace.yaml: patch ${patch} wasn't taken`)
        .toArray();

// A path into `node_modules` only exists after an install, which this check never does
const relativePathProblems = (files, to) =>
    files
        .filter(file => /(?:^|\/)(?:biome|tsconfig[\w.]*|project|nx)\.json$/v.test(file))
        .flatMap(file => {
            const {
                $schema: schema,
                extends: parent,
                references = [],
            } = readJson(path.join(to, file));
            return [schema, parent, ...references.map(reference => reference.path)]
                .filter(
                    relative =>
                        typeof relative === 'string' &&
                        relative.startsWith('.') &&
                        !relative.includes('node_modules')
                )
                .filter(relative => !existsSync(path.join(to, path.dirname(file), relative)))
                .map(relative => `${file}: names ${relative}, which the fork doesn't have`);
        });

// Every relative link in what a fork takes must lead somewhere in it: `apply` points the rest upstream, so one left is
// broken here too
const linkProblems = (files, to) =>
    markdownFiles(files).flatMap(file => {
        const problems = [];
        mapLinks(readFileSync(path.join(to, file), 'utf8'), link => {
            const { resolved } = resolveLink(file, link);
            if (
                isRelativeLink(link) &&
                (resolved.startsWith('..') || !existsSync(path.join(to, resolved)))
            ) {
                problems.push(`${file}: links to ${link}, which doesn't exist`);
            }
            return link;
        });
        return problems;
    });

/**
 * Inspects an applied fork without installing or running anything: whatever it names must have come along.
 *
 * @param options - required
 * @param options.conditions - condition tags the fork asked for
 * @param options.files - files `apply` copied
 * @param options.to - directory `apply` wrote to
 * @returns one message per problem
 */
export const inspect = ({ conditions = [], files, to }) => {
    const manifest = readManifest();
    const requested = new Set(conditions);
    const stripped = new Set(
        Object.entries(manifest.nx.namedInputs)
            .filter(([condition]) => !requested.has(condition))
            .flatMap(([, names]) => names)
    );
    const nxJson = readJson(path.join(to, 'nx.json'));
    return [
        ...dependsOnProblems(nxJson),
        ...targetFileProblems(nxJson, to),
        ...namedInputProblems(nxJson, stripped),
        ...pluginProblems(nxJson, to),
        ...bindingProblems(nxJson, to),
        ...projectTargetProblems(nxJson, to),
        ...catalogProblems(files, to),
        ...patchProblems(to),
        ...relativePathProblems(files, to),
        ...linkProblems(files, to),
    ];
};

const main = () => {
    const { positionals, values } = parseArgs({
        allowPositionals: true,
        options: {
            fork: { type: 'string' },
            package: { multiple: true, type: 'string' },
            to: { type: 'string' },
            with: { type: 'string' },
        },
    });
    if (positionals[0] === 'render') {
        writeFileSync(skillFile, renderSkill());
        return;
    }
    if (positionals[0] === 'drift' && values.fork !== undefined) {
        printDrift(drift(path.resolve(values.fork)));
        return;
    }
    if (positionals[0] === 'resync' && values.fork !== undefined) {
        const { from, to } = resync(path.resolve(values.fork));
        console.log(`Recorded ${values.fork} as caught up: ${from} to ${to}`);
        return;
    }
    if (positionals[0] !== 'apply' || values.to === undefined) {
        throw new Error(
            'Usage: fork-manifest.mjs render | apply --to <dir> [--with go,rust,...] [--package <path>]... | drift --fork <dir> | resync --fork <dir>'
        );
    }
    const conditions = values.with?.split(',') ?? [];
    const { files, skipped } = apply({
        conditions,
        extraPackages: values.package,
        to: path.resolve(values.to),
    });
    console.log(`Copied ${files.length} files to ${values.to}`);
    for (const { path: entryPath, when } of skipped) {
        console.log(`Skipped ${entryPath}: needs \`${when}\``);
    }
};

if (process.argv[1] === import.meta.filename) {
    main();
}

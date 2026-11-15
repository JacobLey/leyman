// Checks that `fork-manifest.json` still draws the line between what a fork takes and what stays in this repo: every
// file under its `roots`, and every file at the top of the workspace, is classified exactly once, every path,
// condition, dependency and target it names is real, and the region markers in what a fork takes balance. It then
// applies the manifest to a temporary directory, and inspects that whatever the result names came along too, so a wrong
// classification fails here without installing anything.
//
// Has no dependencies, because CI's `test` job runs it straight from the checkout, with no `node_modules`.

import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    apply,
    covers,
    dependencyFields,
    inspect,
    listFiles,
    readManifest,
    readSkill,
    regionProblems,
    renderSkill,
    workspaceRoot,
} from './fork-manifest.mjs';

const describeEntries = ({ entries, packages, repoOnly }) => [
    ...entries.map(entry => ({ ...entry, list: 'entries' })),
    ...repoOnly.map(entry => ({ ...entry, list: 'repoOnly' })),
    ...packages.map(entry => ({ ...entry, list: 'packages' })),
];

const checkEntry = ({ conditions }, files, { list, path: entryPath, when, why }) => [
    ...(typeof why === 'string' && why !== '' ? [] : [`${list} ${entryPath}: has no \`why\``]),
    ...(files.some(file => covers(entryPath, file))
        ? []
        : [`${list} ${entryPath}: matches no file git would commit`]),
    ...(when === undefined || Object.hasOwn(conditions, when)
        ? []
        : [`${list} ${entryPath}: unknown condition \`${when}\`, not in \`conditions\``]),
];

const checkFiles = ({ roots }, files, classified) => {
    const matched = files.map(file => ({
        file,
        matches: classified.filter(entry => covers(entry.path, file)),
    }));
    const mustClassify = file => !file.includes('/') || roots.some(root => covers(root, file));
    return [
        ...matched
            .filter(({ matches }) => matches.length > 1)
            .map(({ file, matches }) => {
                const by = matches.map(({ list, path: entryPath }) => `${list} ${entryPath}`);
                return `${file}: classified ${matches.length} times, by ${by.join(' and ')}`;
            }),
        ...matched
            .filter(({ file, matches }) => matches.length === 0 && mustClassify(file))
            .map(
                ({ file }) =>
                    `${file}: unclassified. Add it to \`entries\` or \`repoOnly\` in fork-manifest.json`
            ),
    ];
};

const checkConditions = ({ conditions, dependencies, nx }, classified) => {
    const grouped = [dependencies, nx.namedInputs, nx.plugins, nx.targets];
    return [
        ...Object.keys(conditions)
            .filter(
                condition =>
                    classified.every(({ when }) => when !== condition) &&
                    grouped.every(group => !Object.hasOwn(group, condition))
            )
            .map(condition => `conditions ${condition}: nothing uses it`),
        ...grouped
            .flatMap(group => Object.keys(group))
            .filter(condition => !Object.hasOwn(conditions, condition))
            .map(
                condition =>
                    `nx or dependencies: unknown condition \`${condition}\`, not in \`conditions\``
            ),
    ];
};

const checkNx = ({ nx }) => {
    const { namedInputs, plugins, targetDefaults } = JSON.parse(
        readFileSync(path.join(workspaceRoot, 'nx.json'), 'utf8')
    );
    const pluginNames = new Set(plugins.map(plugin => plugin.plugin ?? plugin));
    return [
        ...[...Object.values(nx.targets).flat(), ...nx.repoOnlyTargets]
            .filter(name => !Object.hasOwn(targetDefaults, name))
            .map(name => `nx: target ${name} isn't in nx.json`),
        ...Object.values(nx.namedInputs)
            .flat()
            .filter(name => !Object.hasOwn(namedInputs, name))
            .map(name => `nx: named input ${name} isn't in nx.json`),
        ...Object.values(nx.plugins)
            .flat()
            .filter(name => !pluginNames.has(name))
            .map(name => `nx: plugin ${name} isn't in nx.json`),
    ];
};

// A dependency cut by condition must be one that a package.json a fork takes declares
const checkDependencies = ({ dependencies, entries, packages }, files) => {
    const taken = [...entries, ...packages];
    const declared = new Set(
        files
            .filter(file => path.basename(file) === 'package.json')
            .filter(file => taken.some(entry => covers(entry.path, file)))
            .flatMap(file => {
                const packageJson = JSON.parse(
                    readFileSync(path.join(workspaceRoot, file), 'utf8')
                );
                return dependencyFields.flatMap(field => Object.keys(packageJson[field] ?? {}));
            })
    );
    return Object.values(dependencies)
        .flat()
        .filter(name => !declared.has(name))
        .map(name => `dependencies ${name}: no package.json a fork takes depends on it`);
};

// The region markers in what a fork takes must balance and name real conditions, or `apply` fails on them
const checkRegions = ({ conditions, entries, packages }, files) => {
    const taken = [...entries, ...packages];
    return files
        .filter(file => taken.some(entry => covers(entry.path, file)))
        .filter(file => !lstatSync(path.join(workspaceRoot, file)).isSymbolicLink())
        .flatMap(file => {
            const text = readFileSync(path.join(workspaceRoot, file), 'utf8');
            return text.includes('fork-manifest:')
                ? regionProblems(text, conditions).map(problem => `${file}: ${problem}`)
                : [];
        });
};

// Whatever a fork asks for, what it gets must hang together: with nothing optional, and with everything
const checkApplied = ({ conditions }) =>
    [[], Object.keys(conditions)].flatMap(requested => {
        const to = mkdtempSync(path.join(tmpdir(), 'fork-manifest-'));
        try {
            const { files } = apply({ conditions: requested, to });
            const label = requested.length === 0 ? 'no conditions' : 'all conditions';
            return inspect({ conditions: requested, files, to }).map(
                problem => `Applied with ${label}: ${problem}`
            );
        } finally {
            rmSync(to, { force: true, recursive: true });
        }
    });

const failures = () => {
    const manifest = readManifest();
    const files = listFiles();
    const classified = describeEntries(manifest);
    const found = [
        ...classified.flatMap(entry => checkEntry(manifest, files, entry)),
        ...checkFiles(manifest, files, classified),
        ...checkConditions(manifest, classified),
        ...checkNx(manifest),
        ...checkDependencies(manifest, files),
        ...checkRegions(manifest, files),
    ];
    if (found.length > 0) {
        // Applying needs the manifest's own paths to be right
        return found;
    }
    const skill =
        readSkill() === renderSkill()
            ? []
            : [
                  'The fork-manifest skill is out of date: run `node leyman/main/scripts/fork-manifest.mjs render`',
              ];
    return [...skill, ...checkApplied(manifest)];
};

// The source Dagger tests leaves out `.git` and most of the roots (`New` in `dagger/main.go`), so inside it there is
// nothing to compare. The `test` job in CI runs this script from the checkout first, where they do exist.
const isInDagger =
    process.env.CI !== undefined && !existsSync(path.join(workspaceRoot, '.devcontainer'));

if (isInDagger) {
    console.log('Skipped: the classified files are not part of the source Dagger tests');
} else {
    const found = failures();
    if (found.length > 0) {
        console.error(found.join('\n'));
        process.exitCode = 1;
    }
}

// Checks that `fork-manifest.json` still draws the line between what a fork takes and what stays in this repo: every
// file under its `roots`, and every file at the top of the workspace, is classified exactly once, and every path,
// condition and rewrite it names is real.
//
// Has no dependencies, because CI's `test` job runs it straight from the checkout, with no `node_modules`.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const workspaceRoot = path.resolve(import.meta.dirname, '../../..');
const allowedRewrites = new Set(['paths']);

const covers = (classified, file) => file === classified || file.startsWith(`${classified}/`);

// What Git would commit: tracked files that still exist, and new ones that aren't ignored
const listFiles = () =>
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- the checkout's own Git, in a script run by hand or CI
    execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
        cwd: workspaceRoot,
        encoding: 'utf8',
    })
        .split('\0')
        .filter(file => file !== '' && existsSync(path.join(workspaceRoot, file)));

const describeEntries = ({ entries, packages, repoOnly }) => [
    ...entries.map(entry => ({ ...entry, list: 'entries' })),
    ...repoOnly.map(entry => ({ ...entry, list: 'repoOnly' })),
    ...packages.map(entry => ({ ...entry, list: 'packages' })),
];

const checkEntry = ({ conditions }, files, { list, path: entryPath, rewrite, when, why }) => [
    ...(typeof why === 'string' && why !== '' ? [] : [`${list} ${entryPath}: has no \`why\``]),
    ...(files.some(file => covers(entryPath, file))
        ? []
        : [`${list} ${entryPath}: matches no file git would commit`]),
    ...(when === undefined || Object.hasOwn(conditions, when)
        ? []
        : [`${list} ${entryPath}: unknown condition \`${when}\`, not in \`conditions\``]),
    ...(rewrite === undefined || allowedRewrites.has(rewrite)
        ? []
        : [`${list} ${entryPath}: unknown rewrite \`${rewrite}\``]),
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

const checkConditions = ({ conditions }, classified) =>
    Object.keys(conditions)
        .filter(condition => classified.every(({ when }) => when !== condition))
        .map(condition => `conditions ${condition}: no entry uses it`);

const failures = () => {
    const manifest = JSON.parse(
        readFileSync(path.join(import.meta.dirname, '../fork-manifest.json'), 'utf8')
    );
    const files = listFiles();
    const classified = describeEntries(manifest);
    return [
        ...classified.flatMap(entry => checkEntry(manifest, files, entry)),
        ...checkFiles(manifest, files, classified),
        ...checkConditions(manifest, classified),
    ];
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

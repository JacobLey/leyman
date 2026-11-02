// Checks that nothing depends on a published copy of a package in this workspace.
//
// `disallowWorkspaceCycles` fails an install on a cycle between workspace packages, but a copy from npm isn't part
// of the workspace, so it would hide one. It would also test against an old build of the package, not the current one.

import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';

const workspaceRoot = path.resolve(import.meta.dirname, '../../..');
const dependencyFields = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
];

const workspaceYaml = readFileSync(path.join(workspaceRoot, 'pnpm-workspace.yaml'), 'utf8');
const lines = workspaceYaml.split('\n');

// Each line of a top-level section of the YAML, which is simple enough to not need a parser
const sectionLines = name => {
    const start = lines.indexOf(`${name}:`);
    if (start === -1) {
        return [];
    }
    const end = lines.findIndex((line, i) => i > start && /^[^\s#]/v.test(line));
    return lines.slice(start + 1, end === -1 ? undefined : end);
};

const patterns = sectionLines('packages')
    .map(line => /^\s*- '?(?<pattern>[^\s']+)'?$/v.exec(line)?.groups?.pattern)
    .filter(pattern => pattern !== undefined);
const isIncluded = file =>
    file.split(path.sep).every(part => part !== 'node_modules' && part !== 'test');

const packageFiles = patterns
    .filter(pattern => !pattern.startsWith('!'))
    .flatMap(pattern => globSync(`${pattern}/package.json`, { cwd: workspaceRoot }))
    .filter(file => isIncluded(file));
const packages = packageFiles.map(file => ({
    file,
    json: JSON.parse(readFileSync(path.join(workspaceRoot, file), 'utf8')),
}));
const workspaceNames = new Set(packages.map(({ json }) => json.name));

const aliasTarget = version => /^npm:(?<name>@?[^@]+)/v.exec(version)?.groups?.name;

const problems = [];

for (const { file, json } of packages) {
    for (const field of dependencyFields) {
        const dependencies = Object.entries(json[field] ?? {});
        for (const [name, version] of dependencies) {
            const isPublishedCopy = workspaceNames.has(name) && !version.startsWith('workspace:');
            if (isPublishedCopy || workspaceNames.has(aliasTarget(version))) {
                problems.push(`${file}: ${field} has ${name}: ${version}`);
            }
        }
    }
}

const catalogLines = [...sectionLines('catalog'), ...sectionLines('catalogs')];
for (const line of catalogLines) {
    const entry = /^\s+'?(?<name>[^\s#':]+)'?:\s+(?<version>\S+)/v.exec(line)?.groups;
    if (
        entry &&
        (workspaceNames.has(entry.name) || workspaceNames.has(aliasTarget(entry.version)))
    ) {
        problems.push(`pnpm-workspace.yaml: catalog has ${entry.name}: ${entry.version}`);
    }
}

if (problems.length > 0) {
    console.error(
        'These depend on a published copy of a workspace package. Use workspace:^ instead:'
    );
    for (const problem of problems) {
        console.error(`  ${problem}`);
    }
    process.exitCode = 1;
}

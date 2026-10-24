// Checks the package exactly as it would be published: packs it with pnpm (resolving `workspace:` and `catalog:`),
// then lints the tarball with publint and checks its types resolve with Are The Types Wrong.
//
// Packages here are ESM only, so CommonJS and `node10` resolution are expected to fail, and only problems that
// affect ESM consumers (Node.js and bundlers) are reported.
//
// Also checks every top-level path of the package is either published or known not to be, so a new one (like
// `data/`) can't be left out of `files` by accident, and nothing that should stay private is published.
//
// Finally type checks the published declaration files as a strict consumer with `skipLibCheck: false` would. A
// `@ts-expect-error` in the source doesn't reach the declarations, so an error it hid surfaces only there. Errors in
// dependencies' declarations are not ours to fix, so only those in the package's own files are reported.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkPackage, createPackageFromTarballData } from '@arethetypeswrong/core';
import { problemAffectsResolutionKind, problemKindInfo } from '@arethetypeswrong/core/problems';
import ignore from 'ignore';
import { publint } from 'publint';
import { formatMessage } from 'publint/utils';

const esmResolutionKinds = ['node16-esm', 'bundler'];

// Top-level paths a package keeps out of `files`
const notPublished = new Set([
    'CHANGELOG.md',
    'biome.json',
    'eslint.config.js',
    'project.json',
    'src',
    'test',
    'tsconfig.json',
]);

const workspaceRoot = process.env.NX_WORKSPACE_ROOT;
if (workspaceRoot === undefined) {
    throw new Error('Run as an Nx target, which sets NX_WORKSPACE_ROOT');
}
// Build output and other untracked files. Read from .gitignore rather than Git, which CI's source has no history for.
const gitignored = ignore().add(readFileSync(path.join(workspaceRoot, '.gitignore'), 'utf8'));
const projectPath = path.relative(workspaceRoot, process.cwd()).replaceAll(path.sep, '/');

const tsc = path.join(import.meta.dirname, '../node_modules/.bin/tsc');
const declarationFile = /\.d\.[cm]?ts$/v;

const packDir = mkdtempSync(path.join(tmpdir(), 'check-package-'));
try {
    const { filename, files } = JSON.parse(
        // eslint-disable-next-line sonarjs/no-os-command-from-path -- Run the workspace's pnpm, like Nx itself
        execFileSync('pnpm', ['pack', '--pack-destination', packDir, '--json'], {
            encoding: 'utf8',
        })
    );
    const tarball = readFileSync(path.resolve(packDir, filename));

    const errors = [];

    const published = new Set(files.map(file => file.path.split('/', 1)[0]));
    const entries = readdirSync(process.cwd(), { withFileTypes: true });
    for (const entry of entries) {
        const entryPath = `${projectPath}/${entry.name}${entry.isDirectory() === true ? '/' : ''}`;
        if (gitignored.ignores(entryPath)) {
            continue;
        }
        if (published.has(entry.name) && notPublished.has(entry.name)) {
            errors.push(
                `files: "${entry.name}" is published, but should never be. Remove it from "files" in package.json.`
            );
        } else if (!published.has(entry.name) && !notPublished.has(entry.name)) {
            errors.push(
                `files: "${entry.name}" is not published. Add it to "files" in package.json, or if it should never be published, to \`notPublished\` in ${path.relative(workspaceRoot, import.meta.filename)}.`
            );
        }
    }

    const { messages, pkg } = await publint({
        pack: {
            tarball: tarball.buffer.slice(
                tarball.byteOffset,
                tarball.byteOffset + tarball.byteLength
            ),
        },
        strict: true,
    });
    for (const message of messages) {
        const text = `publint ${message.type}: ${formatMessage(message, pkg, { color: false })}`;
        if (message.type === 'suggestion') {
            console.log(text);
        } else {
            errors.push(text);
        }
    }

    const analysis = await checkPackage(createPackageFromTarballData(new Uint8Array(tarball)));
    if (analysis.types === false) {
        errors.push('attw: the package has no types');
    } else {
        for (const problem of analysis.problems) {
            const affected = esmResolutionKinds.filter(kind =>
                problemAffectsResolutionKind(problem, kind, analysis)
            );
            if (affected.length === 0) {
                continue;
            }
            const where = 'entrypoint' in problem ? ` "${problem.entrypoint}"` : '';
            const { emoji, description, docsUrl } = problemKindInfo[problem.kind];
            errors.push(
                `attw${where} (${affected.join(', ')}): ${emoji} ${description} ${docsUrl}`
            );
        }
    }

    const declarations = files.map(file => file.path).filter(file => declarationFile.test(file));
    if (declarations.length > 0) {
        let output = '';
        try {
            execFileSync(
                tsc,
                [
                    '--ignoreConfig',
                    '--noEmit',
                    // Nx forces color, which would prefix each diagnostic
                    '--pretty',
                    'false',
                    '--strict',
                    '--skipLibCheck',
                    'false',
                    '--module',
                    'nodenext',
                    '--target',
                    'esnext',
                    '--lib',
                    'esnext,dom',
                    '--types',
                    'node',
                    ...declarations,
                ],
                { encoding: 'utf8' }
            );
        } catch (error) {
            output = error.stdout;
        }
        const own = new Set(declarations);
        for (const line of output.split('\n')) {
            // Each diagnostic starts with `<file>(<line>,<column>): error`, followed by indented detail
            const file = line.slice(0, line.indexOf('('));
            if (own.has(file)) {
                errors.push(`tsc (skipLibCheck: false): ${line}`);
            }
        }
    }

    if (errors.length > 0) {
        console.error(errors.join('\n'));
        process.exitCode = 1;
    } else {
        console.log(
            `${path.basename(filename)}: publint, attw, the published files check and tsc found no problems`
        );
    }
} finally {
    rmSync(packDir, { recursive: true, force: true });
}

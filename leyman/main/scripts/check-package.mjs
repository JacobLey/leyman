#!/usr/bin/env node

// Checks the package exactly as it would be published: packs it with pnpm (resolving `workspace:` and `catalog:`),
// then lints the tarball with publint and checks its types resolve with Are The Types Wrong.
//
// Packages here are ESM only, so CommonJS and `node10` resolution are expected to fail, and only problems that
// affect ESM consumers (Node.js and bundlers) are reported.
//
// Also checks every top-level path of the package is either published or known not to be, so a new one (like
// `data/`) can't be left out of `files` by accident, and nothing that should stay private is published.

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
if (!workspaceRoot) {
    throw new Error('Run as an Nx target, which sets NX_WORKSPACE_ROOT');
}
// Build output and other untracked files. Read from .gitignore rather than git, which CI's source has no history for.
const gitignored = ignore().add(readFileSync(path.join(workspaceRoot, '.gitignore'), 'utf8'));
const projectPath = path.relative(workspaceRoot, process.cwd()).replaceAll(path.sep, '/');

const packDir = mkdtempSync(path.join(tmpdir(), 'check-package-'));
try {
    const { filename, files } = JSON.parse(
        execFileSync('pnpm', ['pack', '--pack-destination', packDir, '--json'], {
            encoding: 'utf8',
        })
    );
    const tarball = readFileSync(path.resolve(packDir, filename));

    const errors = [];

    const published = new Set(files.map(file => file.path.split('/')[0]));
    for (const entry of readdirSync(process.cwd(), { withFileTypes: true })) {
        const entryPath = `${projectPath}/${entry.name}${entry.isDirectory() ? '/' : ''}`;
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
    if (analysis.types) {
        for (const problem of analysis.problems) {
            const affected = esmResolutionKinds.filter(kind =>
                problemAffectsResolutionKind(problem, kind, analysis)
            );
            if (affected.length > 0) {
                const where = 'entrypoint' in problem ? ` "${problem.entrypoint}"` : '';
                const { emoji, description, docsUrl } = problemKindInfo[problem.kind];
                errors.push(
                    `attw${where} (${affected.join(', ')}): ${emoji} ${description} ${docsUrl}`
                );
            }
        }
    } else {
        errors.push('attw: the package has no types');
    }

    if (errors.length > 0) {
        console.error(errors.join('\n'));
        process.exitCode = 1;
    } else {
        console.log(
            `${path.basename(filename)}: publint, attw and the published files check found no problems`
        );
    }
} finally {
    rmSync(packDir, { recursive: true, force: true });
}

#!/usr/bin/env node

// Checks the package exactly as it would be published: packs it with pnpm (resolving `workspace:` and `catalog:`),
// then lints the tarball with publint and checks its types resolve with Are The Types Wrong.
//
// Packages here are ESM only, so CommonJS and `node10` resolution are expected to fail, and only problems that
// affect ESM consumers (Node.js and bundlers) are reported.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkPackage, createPackageFromTarballData } from '@arethetypeswrong/core';
import { problemAffectsResolutionKind, problemKindInfo } from '@arethetypeswrong/core/problems';
import { publint } from 'publint';
import { formatMessage } from 'publint/utils';

const esmResolutionKinds = ['node16-esm', 'bundler'];

const packDir = mkdtempSync(path.join(tmpdir(), 'check-package-'));
try {
    const { filename } = JSON.parse(
        execFileSync('pnpm', ['pack', '--pack-destination', packDir, '--json'], {
            encoding: 'utf8',
        })
    );
    const tarball = readFileSync(path.resolve(packDir, filename));

    const errors = [];

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
        console.log(`${path.basename(filename)}: publint and attw found no problems`);
    }
} finally {
    rmSync(packDir, { recursive: true, force: true });
}

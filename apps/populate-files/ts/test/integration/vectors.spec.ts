import type { PopulateFileParams, PopulateOptions, PopulationResponse } from 'populate-files';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { dir } from 'tmp-promise';
import { expect } from '@leyman/expect';
import testVectors from '@leyman/populate-files-test-vectors/test-vectors.json' with {
    type: 'json',
};
import { GeneratedSignatureManifestError, parseManifest } from 'generated-signature';
import { suite, test } from 'mocha-chain';
import {
    populateFile,
    populateFiles,
    PopulateFilesCheckError,
    PopulateFilesOwnershipError,
} from 'populate-files';

interface Step {
    readonly call: string;
    readonly files: readonly PopulateFileParams[];
    readonly options: PopulateOptions;
}

const run = async (cwd: string, { call, files, options }: Step): Promise<PopulationResponse[]> =>
    call === 'populateFile'
        ? [await populateFile(files[0]!, { check: false, ...options, cwd })]
        : populateFiles(files, { check: false, ...options, cwd });

const relative = (cwd: string, filePath: string): string =>
    Path.relative(cwd, filePath).replaceAll(Path.sep, '/');

const listFiles = async (
    cwd: string,
    manifests: ReadonlySet<string>
): Promise<Record<string, string>> => {
    const entries = await readdir(cwd, { recursive: true, withFileTypes: true });
    const files = await Promise.all(
        entries
            .filter(entry => entry.isFile())
            .map(entry => relative(cwd, Path.join(entry.parentPath, entry.name)))
            .filter(filePath => !manifests.has(filePath))
            .map(
                async (filePath): Promise<[string, string]> => [
                    filePath,
                    await readFile(Path.join(cwd, filePath), 'utf8'),
                ]
            )
    );
    return Object.fromEntries(files);
};

/**
 * The value of a promise, or its error.
 *
 * @param promise - to settle
 * @returns its value or error
 */
const settle = async (promise: Promise<unknown>): Promise<unknown> => {
    try {
        return await promise;
    } catch (err) {
        return err;
    }
};

const errorOf = (cwd: string, err: unknown): unknown => {
    if (err instanceof PopulateFilesCheckError) {
        return {
            kind: 'check',
            files: err.files.map(({ filePath, reason }) => ({
                filePath: relative(cwd, filePath),
                reason,
            })),
        };
    }
    if (err instanceof PopulateFilesOwnershipError) {
        return { kind: 'ownership', filePath: relative(cwd, err.filePath), reason: err.reason };
    }
    if (err instanceof GeneratedSignatureManifestError) {
        return { kind: 'manifest' };
    }
    if (err instanceof TypeError && err.message.includes('more than once')) {
        return { kind: 'duplicate-file' };
    }
    throw err;
};

// Scenarios shared with every populate-files implementation. Manifests are compared parsed, as their layout is the
// formatter's.
suite('Test vectors', () => {
    for (const vector of testVectors.scenarios) {
        test(vector.description, async () => {
            const tmpDir = await dir({ prefix: 'populate-files-vectors', unsafeCleanup: true });
            const cwd = tmpDir.path;
            try {
                const setup: readonly Step[] = 'setup' in vector ? vector.setup : [];
                for (const step of setup) {
                    await run(cwd, step);
                }
                const writes: Readonly<Record<string, string | null>> =
                    'writes' in vector ? vector.writes : {};
                for (const [filePath, content] of Object.entries(writes)) {
                    const full = Path.join(cwd, filePath);
                    if (content === null) {
                        await rm(full);
                    } else {
                        await mkdir(Path.dirname(full), { recursive: true });
                        await writeFile(full, content);
                    }
                }
                const edits = 'edits' in vector ? vector.edits : [];
                for (const edit of edits) {
                    const full = Path.join(cwd, edit.filePath);
                    const text = await readFile(full, 'utf8');
                    await writeFile(
                        full,
                        text.replace(edit.from, () => edit.to)
                    );
                }

                const step: Step = vector;
                const manifests = new Set(
                    [...setup, step]
                        .map(({ options }) => options.manifest)
                        .filter(manifest => typeof manifest === 'string')
                        .map(manifest => Path.normalize(manifest))
                );
                if ('error' in vector) {
                    const thrown = await settle(run(cwd, step));
                    expect(errorOf(cwd, thrown)).to.deep.equal(vector.error);
                    // Nothing is written when a call fails
                    expect(await listFiles(cwd, manifests)).to.deep.equal(vector.after);
                    return;
                }

                const results = await run(cwd, step);
                expect(
                    results.map(result => ({ ...result, filePath: relative(cwd, result.filePath) }))
                ).to.deep.equal(vector.results);
                expect(await listFiles(cwd, manifests)).to.deep.equal(vector.after);

                if ('manifest' in vector) {
                    const manifestPath = Path.join(cwd, step.options.manifest!);
                    const text = await settle(readFile(manifestPath, 'utf8'));
                    expect(
                        typeof text === 'string' ? parseManifest(text).files : null
                    ).to.deep.equal(vector.manifest);
                }
            } finally {
                await tmpDir.cleanup();
            }
        });
    }
});

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import Path from 'node:path';
import { promisify } from 'node:util';

/**
 * A test suite pinned in `test/suites.json`.
 */
interface PinnedSuite {
    /**
     * Where `fetch-suites.ts` downloads it from.
     */
    readonly url: string;
    /**
     * Sha256 of the tarball.
     */
    readonly sha256: string;
    /**
     * The tarball's top-level directory.
     */
    readonly root: string;
}

/**
 * Root of this project, from `dist-test/lib`.
 */
const projectRoot = Path.join(import.meta.dirname, '../..');

/**
 * A suite, extracted for one test run.
 */
export interface ExtractedSuite {
    /**
     * Directory holding the suite's files.
     */
    readonly root: string;
    /**
     * Deletes the extracted files.
     */
    readonly remove: () => Promise<void>;
}

/**
 * Extracts a suite that `fetch-suites` downloaded (it runs before the tests) into a new temporary directory.
 *
 * @param name - key in `test/suites.json`
 * @returns where it is, and how to delete it
 */
export const extractSuite = async (name: 'xmlconf' | 'xsdtests'): Promise<ExtractedSuite> => {
    const pins = JSON.parse(
        await readFile(Path.join(projectRoot, 'test/suites.json'), 'utf8')
    ) as Record<string, PinnedSuite>;
    const directory = await mkdtemp(Path.join(tmpdir(), `xenever-${name}-`));
    await promisify(execFile)('tar', [
        '-xzf',
        Path.join(projectRoot, '.suites', `${name}.tar.gz`),
        '-C',
        directory,
    ]);
    return {
        root: Path.join(directory, pins[name]!.root),
        remove: async () => rm(directory, { recursive: true, force: true }),
    };
};

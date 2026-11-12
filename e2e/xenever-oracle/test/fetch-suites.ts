// Downloads each test suite in test/suites.json into .suites/<name>.tar.gz, unless a file with the pinned
// sha256 is already there, and fails on any other hash. The suites are fetched rather than committed: they are
// large third-party trees under their own licenses, and the tests only need them extracted for a run. Run by
// the `fetch-suites` target with Node.js directly, which strips the types, so it imports nothing of the project.
/* eslint-disable n/no-top-level-await -- A script Node.js runs, never a module anything imports */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import Path from 'node:path';

/**
 * A pinned suite, as `test/suites.json` holds it.
 */
interface Pin {
    readonly url: string;
    readonly sha256: string;
}

const projectRoot = Path.join(import.meta.dirname, '..');
const directory = Path.join(projectRoot, '.suites');
const attempts = 3;

/**
 * The sha256 of some bytes.
 *
 * @param bytes - contents
 * @returns their sha256, in hex
 */
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/**
 * Reads a file, if there is one.
 *
 * @param path - file to read
 * @returns its contents, or `null` when there is none
 * @rejects {Error} when it can't be read for another reason
 */
const readIfExists = async (path: string): Promise<Uint8Array | null> => {
    try {
        return await readFile(path);
    } catch (error) {
        if ((error as { readonly code?: unknown }).code === 'ENOENT') {
            return null;
        }
        throw error;
    }
};

/**
 * Downloads a URL, trying a failed request again up to `attempts` times in all: a network error is rarely
 * a reason to fail a test run.
 *
 * @param url - what to download
 * @param attempt - which attempt this is
 * @returns the body
 * @rejects {Error} when the last attempt fails
 */
const download = async (url: string, attempt = 1): Promise<Uint8Array> => {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (!response.ok) {
            throw new Error(`GET ${url}: ${response.status} ${response.statusText}`);
        }
        return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
        if (attempt === attempts) {
            throw error;
        }
        return download(url, attempt + 1);
    }
};

const suites = JSON.parse(
    await readFile(Path.join(projectRoot, 'test/suites.json'), 'utf8')
) as Readonly<Record<string, Pin>>;
await mkdir(directory, { recursive: true });
for (const [name, { url, sha256: expected }] of Object.entries(suites)) {
    const path = Path.join(directory, `${name}.tar.gz`);
    const existing = await readIfExists(path);
    if (existing !== null && sha256(existing) === expected) {
        continue;
    }
    const bytes = await download(url);
    const actual = sha256(bytes);
    if (actual !== expected) {
        throw new Error(`${url} has sha256 ${actual}, not the pinned ${expected}`);
    }
    // Written beside the target first, so an interrupted run never leaves a partial file at the path.
    await writeFile(`${path}.partial`, bytes);
    await rename(`${path}.partial`, path);
}

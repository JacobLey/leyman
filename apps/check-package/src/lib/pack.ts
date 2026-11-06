import type { PackWith } from './root.js';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface PackOutput {
    filename: string;
    files: readonly { path: string }[];
}

/**
 * Packs the package as it would be published, with the package manager that publishes it, so
 * `workspace:` and `catalog:` versions are resolved as on npm.
 *
 * @param params - where the package is, where the tarball goes, and what packs it
 * @param params.cwd - the package directory
 * @param params.packDir - where to write the tarball
 * @param params.packWith - the package manager
 * @returns the tarball, and the paths of the files in it
 */
export const pack = async ({
    cwd,
    packDir,
    packWith,
}: {
    cwd: string;
    packDir: string;
    packWith: PackWith;
}): Promise<{ files: string[]; tarball: Buffer }> => {
    const { stdout } = await execFileAsync(
        packWith,
        ['pack', '--pack-destination', packDir, '--json'],
        {
            cwd,
        }
    );
    // The npm CLI prints an array, one entry per package packed; pnpm prints the one package's
    const output = JSON.parse(stdout) as PackOutput | [PackOutput];
    const { filename, files } = Array.isArray(output) ? output[0] : output;
    return {
        files: files.map(file => file.path),
        tarball: await readFile(Path.resolve(packDir, filename)),
    };
};

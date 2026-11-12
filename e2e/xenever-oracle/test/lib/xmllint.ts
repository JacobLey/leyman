import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { validateXML } from 'xmllint-wasm';

/**
 * What `xmllint --schema` says of a schema and the instances validated against it.
 */
export interface XmllintResult {
    /**
     * Whether the schema compiled.
     */
    readonly schemaValid: boolean;
    /**
     * Whether each instance is valid, by its path; all `false` when the schema doesn't compile.
     */
    readonly instances: ReadonlyMap<string, boolean>;
    /**
     * Xmllint's output, for a report.
     */
    readonly output: string;
}

/**
 * A file for xmllint, read from a directory.
 *
 * @param root - directory the path is from
 * @param path - path of the file from the root, which is also its name in xmllint's file system
 * @returns the file, as bytes: xmllint decodes them itself
 */
const xmllintFile = async (
    root: string,
    path: string
): Promise<{ fileName: string; contents: Uint8Array }> => ({
    fileName: path,
    contents: await readFile(Path.join(root, path)),
});

/**
 * A stand-in instance, as xmllint needs one to compile a schema.
 */
const probe = { fileName: 'xenever-probe.xml', contents: '<xenever-probe/>' };

/**
 * Validates instances against a schema with libxml2's `xmllint --schema`, in WebAssembly.
 *
 * Every file goes in xmllint's in-memory file system at its path from `root`, so relative
 * `schemaLocation`s resolve as on disk. It has no IO of its own, so `files` lists every schema document
 * the schema reads.
 *
 * @param root - directory the paths are from
 * @param files - schema documents, the entry first, then each one it includes or imports
 * @param instances - paths of the instances
 * @returns what xmllint says
 */
export const xmllint = async (
    root: string,
    files: readonly string[],
    instances: readonly string[]
): Promise<XmllintResult> => {
    // A missing file is left out, for xmllint to report as it would on disk.
    const read = await Promise.all(
        files.map(async file => {
            try {
                return await xmllintFile(root, file);
            } catch {
                return null;
            }
        })
    );
    const [entry, ...preload] = read.filter(file => file !== null);
    if (entry === undefined || entry.fileName !== files[0]) {
        return {
            output: `${String(files[0])} is missing`,
            schemaValid: false,
            instances: new Map(instances.map(path => [path, false])),
        };
    }
    const xml =
        instances.length > 0
            ? await Promise.all(instances.map(async path => xmllintFile(root, path)))
            : [probe];
    let output: string;
    try {
        const validated = await validateXML({
            preload: preload.filter(file => file.fileName !== entry.fileName),
            schema: entry,
            maxMemoryPages: 4096,
            xml,
        });
        output = validated.rawOutput;
    } catch (error) {
        // Xmllint exits with its own code, rather than "invalid", when a schema doesn't compile or an instance
        // isn't well-formed, and xmllint-wasm then rejects with its output as the message.
        output = (error as Error).message;
    }
    const isSchemaValid = !output.includes(`WXS schema ${entry.fileName} failed to compile`);
    const lines = new Set(output.split('\n'));
    return {
        schemaValid: isSchemaValid,
        instances: new Map(
            instances.map(path => [path, isSchemaValid && lines.has(`${path} validates`)])
        ),
        output,
    };
};

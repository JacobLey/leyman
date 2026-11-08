import type { Options } from 'prettier';
import type { Supplier } from 'haywire';
import type { CanUseFormatter } from '#types';
import type { PrettierImport, PrettierModule } from './lib-path.js';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { findUp } from 'find-up';

/**
 * Files that are a Prettier config by their name alone.
 *
 * @see https://prettier.io/docs/configuration
 */
const configFiles = [
    '.prettierrc',
    '.prettierrc.json',
    '.prettierrc.yml',
    '.prettierrc.yaml',
    '.prettierrc.json5',
    '.prettierrc.js',
    'prettier.config.js',
    '.prettierrc.ts',
    'prettier.config.ts',
    '.prettierrc.mjs',
    'prettier.config.mjs',
    '.prettierrc.mts',
    'prettier.config.mts',
    '.prettierrc.cjs',
    'prettier.config.cjs',
    '.prettierrc.cts',
    'prettier.config.cts',
    '.prettierrc.toml',
];

/**
 * Whether a directory's `package.json` has a `prettier` key, as Prettier reads one.
 *
 * @param directory - directory to check
 * @returns `package.json` if it configures Prettier
 */
const packageJsonConfig = async (directory: string): Promise<string | undefined> => {
    try {
        const raw = await readFile(Path.join(directory, 'package.json'), 'utf8');
        const { prettier } = JSON.parse(raw) as { prettier?: unknown };
        const isConfigured = Boolean(prettier);
        return isConfigured ? 'package.json' : undefined;
    } catch {
        return undefined;
    }
};

/**
 * Directories whose files the Prettier CLI skips, even when passed explicitly.
 *
 * @see https://github.com/prettier/prettier/blob/1172b82c295c4f889fd787dc6c78c3e194ebf353/src/cli/directory-ignorer.js#L3-L5
 */
const ignoredDirectories = new Set(['.git', '.sl', '.svn', '.hg', '.jj', 'node_modules']);

/**
 * Whether a file is in a directory the Prettier CLI skips, judged by its path relative to the working directory
 * as the CLI does.
 *
 * @see https://github.com/prettier/prettier/blob/1172b82c295c4f889fd787dc6c78c3e194ebf353/src/cli/directory-ignorer.js#L24-L32
 *
 * @param file - absolute path
 * @returns true if skipped
 */
const isInIgnoredDirectory = (file: string): boolean =>
    Path.relative(process.cwd(), file)
        .split(Path.sep)
        .some(name => ignoredDirectories.has(name));

/**
 * Whether `.prettierignore` (in the working directory) or being in `node_modules` excludes a file.
 * `.gitignore` is not read, unlike the CLI's default.
 *
 * @param prettier - Prettier module
 * @param file - absolute path
 * @returns true if ignored
 */
const isIgnored = async (prettier: PrettierModule, file: string): Promise<boolean> => {
    // Only `ignored` is used: the parser is inferred again when formatting, with the config's plugins
    const { ignored } = await prettier.getFileInfo(file, {
        ignorePath: '.prettierignore',
        resolveConfig: false,
    });
    return ignored;
};

/**
 * Options for formatting a file, from its Prettier config and `.editorconfig`, which the CLI reads by default.
 *
 * @see https://github.com/prettier/prettier/blob/1172b82c295c4f889fd787dc6c78c3e194ebf353/src/cli/cli-options.evaluate.js#L160-L166
 *
 * @param prettier - Prettier module
 * @param file - absolute path
 * @returns options, with the path to infer a parser from
 */
const resolveOptions = async (prettier: PrettierModule, file: string): Promise<Options> => ({
    ...(await prettier.resolveConfig(file, { editorconfig: true })),
    filepath: file,
});

/**
 * Format a file in place, as `prettier --write` does. Throws if Prettier can't format it: it is missing, not a regular
 * file (the CLI rejects a symbolic link, and a directory isn't a file), no parser is inferred, or it doesn't parse.
 *
 * @see https://github.com/prettier/prettier/blob/1172b82c295c4f889fd787dc6c78c3e194ebf353/src/cli/expand-patterns.js#L66-L80
 *
 * @param prettier - Prettier module
 * @param file - absolute path
 * @rejects if Prettier can't format the file
 */
const formatFile = async (prettier: PrettierModule, file: string): Promise<void> => {
    const stats = await lstat(file);
    if (!stats.isFile()) {
        throw new Error(`Not a regular file: ${file}`);
    }
    if (await isIgnored(prettier, file)) {
        return;
    }
    const options = await resolveOptions(prettier, file);
    const input = await readFile(file, 'utf8');
    const output = await prettier.format(input, options);
    if (output !== input) {
        await writeFile(file, output);
    }
};

/**
 * Prettier formatter, run in this process: Prettier is imported on first use and kept.
 *
 * Prettier is an optional peer dependency, so its import is injected to allow simulating it being uninstalled.
 *
 * Every file passed is formatted, including ones that `.gitignore` lists: only `.prettierignore` is read.
 * Each call reads configuration afresh, as each run of Prettier's CLI did.
 */
export class Prettier {
    readonly #getPrettierImport: Supplier<PrettierImport>;
    #prettier: Promise<PrettierModule> | null = null;

    public readonly canUsePrettier: () => Promise<CanUseFormatter>;
    public readonly formatPrettierFiles: (files: readonly string[]) => Promise<void>;
    public readonly formatPrettierText: (text: string, filePath: string) => Promise<string>;

    public constructor(getPrettierImport: Supplier<PrettierImport>) {
        this.#getPrettierImport = getPrettierImport;

        this.canUsePrettier = this.#canUsePrettier.bind(this);
        this.formatPrettierFiles = this.#formatPrettierFiles.bind(this);
        this.formatPrettierText = this.#formatPrettierText.bind(this);
    }

    async #canUsePrettier(): Promise<CanUseFormatter> {
        try {
            this.#getPrettierImport();
        } catch {
            return 0;
        }

        // Looked for without importing Prettier, so that Biome's users don't pay for the import
        const config = (await findUp(configFiles)) ?? (await findUp(packageJsonConfig));
        if (config !== undefined) {
            return 2;
        }
        if ((await findUp('package.yaml')) === undefined) {
            return 1;
        }

        // Only Prettier reads a `package.yaml`, which takes a YAML parser
        const { resolveConfigFile } = await this.#importPrettier();
        return (await resolveConfigFile()) === null ? 1 : 2;
    }

    /**
     * Format each file, then throw if any failed, so that the caller tries the next formatter on them all,
     * as when the CLI exited with an error. Files in a directory the CLI skips are left unchanged.
     *
     * @param files - files to format
     * @rejects if Prettier failed on any file, or every file is in a directory the CLI skips
     */
    async #formatPrettierFiles(files: readonly string[]): Promise<void> {
        const prettier = await this.#loadPrettier();
        // Each file once, as the CLI does
        const uniqueFiles = new Set(files.map(filePath => Path.resolve(filePath)));
        const formattable = [...uniqueFiles].filter(file => !isInIgnoredDirectory(file));
        if (formattable.length === 0) {
            // The CLI fails when every file passed is in a skipped directory, though it skips them among others
            // https://github.com/prettier/prettier/blob/1172b82c295c4f889fd787dc6c78c3e194ebf353/src/cli/expand-patterns.js#L38-L43
            throw new Error('Every file is in a directory Prettier skips');
        }
        const errors: unknown[] = [];
        for (const file of formattable) {
            try {
                await formatFile(prettier, file);
            } catch (error) {
                errors.push(error);
            }
        }
        if (errors.length > 0) {
            throw new AggregateError(errors, 'Prettier failed to format files');
        }
    }

    /**
     * Format text as if it were the file at `filePath`, as `prettier --stdin-filepath` does.
     * An ignored path returns the text unchanged, as the CLI echoes it.
     *
     * @see https://github.com/prettier/prettier/blob/1172b82c295c4f889fd787dc6c78c3e194ebf353/src/cli/format.js#L242-L245
     *
     * @param text - text to format
     * @param filePath - path to format it as
     * @returns formatted text
     */
    async #formatPrettierText(text: string, filePath: string): Promise<string> {
        const prettier = await this.#loadPrettier();
        const file = Path.resolve(filePath);
        return (await isIgnored(prettier, file))
            ? text
            : prettier.format(text, await resolveOptions(prettier, file));
    }

    /**
     * Prettier, imported once.
     *
     * @returns Prettier module
     */
    async #importPrettier(): Promise<PrettierModule> {
        this.#prettier ??= this.#getPrettierImport()();
        return this.#prettier;
    }

    /**
     * Prettier, with its config cache cleared so that this call reads configuration as it is now.
     *
     * @returns Prettier module
     */
    async #loadPrettier(): Promise<PrettierModule> {
        const prettier = await this.#importPrettier();
        await prettier.clearConfigCache();
        return prettier;
    }
}

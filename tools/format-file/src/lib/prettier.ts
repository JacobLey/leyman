import type { Supplier } from 'haywire';
import type { CanUseFormatter } from '#types';
import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { findUp } from 'find-up';
import { execFileAsync, execWithInput } from './exec.js';

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
 * Prettier formatter.
 *
 * Prettier is an optional peer dependency, so its path is injected to allow simulating it being uninstalled.
 *
 * Every file passed is formatted, including ones that `.gitignore` lists: only `.prettierignore` is read.
 */
export class Prettier {
    readonly #getPrettierPath: Supplier<string>;

    public readonly canUsePrettier: () => Promise<CanUseFormatter>;
    public readonly formatPrettierFiles: (files: readonly string[]) => Promise<void>;
    public readonly formatPrettierText: (text: string, filePath: string) => Promise<string>;

    public constructor(getPrettierPath: Supplier<string>) {
        this.#getPrettierPath = getPrettierPath;

        this.canUsePrettier = this.#canUsePrettier.bind(this);
        this.formatPrettierFiles = this.#formatPrettierFiles.bind(this);
        this.formatPrettierText = this.#formatPrettierText.bind(this);
    }

    async #canUsePrettier(): Promise<CanUseFormatter> {
        try {
            this.#getPrettierPath();
        } catch {
            return 0;
        }

        // Looked for without importing Prettier, which takes as long as a Biome run, so that Biome's users don't pay it
        const config = (await findUp(configFiles)) ?? (await findUp(packageJsonConfig));
        if (config !== undefined) {
            return 2;
        }
        if ((await findUp('package.yaml')) === undefined) {
            return 1;
        }

        // Only Prettier reads a `package.yaml`, which takes a YAML parser
        const { resolveConfigFile } = await import('prettier');
        return (await resolveConfigFile()) === null ? 1 : 2;
    }

    async #formatPrettierFiles(files: readonly string[]): Promise<void> {
        await execFileAsync(this.#getPrettierPath(), [
            ...files,
            '--ignore-path=.prettierignore',
            '--write',
        ]);
    }

    async #formatPrettierText(text: string, filePath: string): Promise<string> {
        return execWithInput(
            this.#getPrettierPath(),
            ['--ignore-path=.prettierignore', '--stdin-filepath', filePath],
            text
        );
    }
}

import type { FormatFileError } from '#lib';

export type Formatters = 'biome' | 'inherit' | 'prettier';
export interface FileFormatterOptions {
    /**
     * Formatter to use.
     * Defaults to `inherit`, the most preferred installed formatter: one with a config file, then Biome before Prettier.
     */
    formatter?: Formatters | null | undefined;
    /**
     * Unsafe: try the next formatter whenever one fails, and resolve even if they all fail.
     *
     * A formatter can write some files before it fails on another, and the next formatter then reformats them all in
     * its own style. Biome also fails on files it ignores or doesn't support, so they reach Prettier.
     */
    unsafeFallback?: boolean | undefined;
}

/**
 * Format files in place, relative paths resolve from `process.cwd()`.
 *
 * Only the most preferred formatter runs. Files it ignores or doesn't support, missing files, and every file when no
 * formatter is installed are left unchanged without an error. If it fails, such as on a syntax error or an invalid
 * config, it rejects with a {@link FormatFileError}, and the files it formatted before failing stay formatted.
 *
 * @rejects {FormatFileError} if the formatter fails
 */
export type FilesFormatter = (
    files: readonly string[],
    options?: FileFormatterOptions
) => Promise<void>;
/**
 * Format a file in place, like {@link FilesFormatter}.
 *
 * @rejects {FormatFileError} if the formatter fails
 */
export type FileFormatter = (file: string, options?: FileFormatterOptions) => Promise<void>;

export interface TextFormatterOptions extends FileFormatterOptions {
    /**
     * Extension of file type.
     * Defaults to `.js`.
     */
    ext?: '.json' | `.${'' | 'c' | 'm'}${'js' | 'ts'}${'' | 'x'}`;
}
/**
 * Format text as if it were a file in the working directory, so the project's configuration applies.
 * Returns the text unchanged if no formatter is installed, or the formatter ignores that path.
 *
 * @rejects {FormatFileError} if the formatter fails, such as on a syntax error or an invalid config
 */
export type TextFormatter = (text: string, options?: TextFormatterOptions) => Promise<string>;

/**
 * 0 = not usable
 * 1 = usable, but not configured
 * 2 = usable and configured
 */
export type CanUseFormatter = 0 | 1 | 2;

/**
 * How a formatter treats a file passed to it that it doesn't format: one it ignores or doesn't support, or a missing one.
 */
export interface FormatterFilesOptions {
    /**
     * Leave such files unchanged without an error. Otherwise reject as the formatter's CLI exits with an error.
     */
    readonly skipUnmatched: boolean;
}

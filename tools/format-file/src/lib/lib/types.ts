export type Formatters = 'biome' | 'inherit' | 'prettier';
export interface FileFormatterOptions {
    /**
     * Formatter to use.
     * Defaults to `inherit`, which will iterate through formatters until success,
     * or else will return the content unchanged.
     */
    formatter?: Formatters | null | undefined;
}

/**
 * Format files in place, relative paths resolve from `process.cwd()`.
 *
 * Never rejects because of a formatter: a missing formatter, a file it fails on (or ignores) and a missing file
 * are left unchanged without an error.
 */
export type FilesFormatter = (
    files: readonly string[],
    options?: FileFormatterOptions
) => Promise<void>;
/**
 * Format a file in place. Like {@link FilesFormatter}, it never rejects because of a formatter.
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
 * Returns the text unchanged if no formatter succeeds.
 */
export type TextFormatter = (text: string, options?: TextFormatterOptions) => Promise<string>;

/**
 * 0 = not usable
 * 1 = usable, but not configured
 * 2 = usable and configured
 */
export type CanUseFormatter = 0 | 1 | 2;

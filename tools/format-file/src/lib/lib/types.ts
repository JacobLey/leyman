import type { execFile } from 'node:child_process';

export type Executor = (typeof execFile)['__promisify__'];

/**
 * Allows string literals in place of enum.
 *
 * @template E - either entire enum or single value
 */
type EnumToString<E extends string> = `${E}`;

export const enum Formatters {
    BIOME = 'biome',
    PRETTIER = 'prettier',
    INHERIT = 'inherit',
}
export interface FileFormatterOptions {
    /**
     * Formatter to use.
     * Defaults to `inherit`, which will iterate through formatters until success,
     * or else will return the content unchanged.
     */
    formatter?: EnumToString<Formatters> | null | undefined;
}

export type FilesFormatter = (files: string[], options?: FileFormatterOptions) => Promise<void>;
export type FileFormatter = (file: string, options?: FileFormatterOptions) => Promise<void>;

export interface TextFormatterOptions extends FileFormatterOptions {
    /**
     * Extension of file type.
     * Defaults to `.js`.
     */
    ext?: '.json' | `.${'' | 'c' | 'm'}${'js' | 'ts'}${'' | 'x'}`;
}
export type TextFormatter = (text: string, options?: TextFormatterOptions) => Promise<string>;

/**
 * 0 = not usable
 * 1 = usable, but not configured
 * 2 = usable and configured
 */
export type CanUseFormatter = 0 | 1 | 2;

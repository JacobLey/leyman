import type { execFile } from 'node:child_process';

export type Executor = (typeof execFile)['__promisify__'];
export type FilesFormatter = (files?: string[] | undefined) => Promise<void>;
export type FileFormatter = (file: string) => Promise<void>;

export interface TextFormatterOptions {
    /**
     * Extension of file type.
     * Defaults to `.js`
     */
    ext?: string;
}
export type TextFormatter = (text: string, options?: TextFormatterOptions) => Promise<string>;

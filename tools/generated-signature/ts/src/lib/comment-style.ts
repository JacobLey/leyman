import Path from 'node:path';
import { GeneratedSignatureCommentStyleError } from './errors.js';

export interface CommentStyle {
    readonly start: string;
    readonly end?: string;
}

export type CommentOptions = { readonly comment: CommentStyle } | { readonly filePath: string };

const slashes = { start: '//' } as const satisfies CommentStyle;
const hash = { start: '#' } as const satisfies CommentStyle;
const block = { start: '/*', end: '*/' } as const satisfies CommentStyle;
const markup = { start: '<!--', end: '-->' } as const satisfies CommentStyle;
const dashes = { start: '--' } as const satisfies CommentStyle;

const byExtension: ReadonlyMap<string, CommentStyle> = new Map<string, CommentStyle>([
    ...[
        '.c',
        '.cc',
        '.cjs',
        '.cpp',
        '.cs',
        '.cts',
        '.go',
        '.h',
        '.hpp',
        '.java',
        '.js',
        '.json5',
        '.jsonc',
        '.jsx',
        '.kt',
        '.less',
        '.mjs',
        '.mts',
        '.rs',
        '.scss',
        '.swift',
        '.ts',
        '.tsx',
    ].map(ext => [ext, slashes] as const),
    ...[
        '.bash',
        '.cfg',
        '.conf',
        '.env',
        '.ini',
        '.pl',
        '.properties',
        '.py',
        '.r',
        '.rb',
        '.sh',
        '.toml',
        '.yaml',
        '.yml',
        '.zsh',
    ].map(ext => [ext, hash] as const),
    ['.css', block],
    ...['.htm', '.html', '.md', '.mdx', '.svg', '.vue', '.xml'].map(ext => [ext, markup] as const),
    ...['.hs', '.lua', '.sql'].map(ext => [ext, dashes] as const),
]);

// Matched on the whole file name, since these conventionally have no extension.
const byFileName: ReadonlyMap<string, CommentStyle> = new Map<string, CommentStyle>([
    ['.gitattributes', hash],
    ['.gitignore', hash],
    ['.npmignore', hash],
    ['Dockerfile', hash],
    ['Makefile', hash],
]);

/**
 * Look up the line comment syntax for a file, based on its name.
 *
 * @param filePath - path (or name) of the file
 * @returns comment style, or `null` if unknown (or the format has no comments, like JSON)
 */
export const commentStyle = (filePath: string): CommentStyle | null => {
    const base = Path.basename(filePath);
    return (
        byFileName.get(base) ??
        byExtension.get(Path.extname(base).toLowerCase()) ??
        // E.g. `Dockerfile.dev`
        byFileName.get(base.split('.', 1)[0]!) ??
        null
    );
};

export const resolveCommentStyle = (options: CommentOptions): CommentStyle => {
    if ('comment' in options) {
        return options.comment;
    }
    const style = commentStyle(options.filePath);
    if (style === null) {
        throw new GeneratedSignatureCommentStyleError(options.filePath);
    }
    return style;
};

export const renderComment = (style: CommentStyle, text: string): string =>
    style.end === undefined ? `${style.start} ${text}` : `${style.start} ${text} ${style.end}`;

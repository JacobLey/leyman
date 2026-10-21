import type { CommentOptions } from './comment-style.js';
import { createHash } from 'node:crypto';
import { renderComment, resolveCommentStyle } from './comment-style.js';
import { GeneratedSignatureMalformedError } from './errors.js';
import { replaceBodies, scanSections } from './sections.js';

const VERSION = '1';
const HASH_LENGTH = 32;
const PLACEHOLDER = '0'.repeat(HASH_LENGTH);
// Kept as separate pieces so this source file never contains a full token itself.
const TOKEN_NAME = '@generated-signature';
const tokenPattern = new RegExp(
    String.raw`${TOKEN_NAME} v(?<version>\d+):(?<hash>[\da-f]{${HASH_LENGTH}})`,
    'gu'
);
const DEFAULT_MESSAGE = 'Generated file. Do not edit outside of manual sections.';

interface Token {
    /**
     * Offset of the hash within the text.
     */
    readonly hashStart: number;
    readonly hash: string;
}

const lineOf = (text: string, offset: number): number => text.slice(0, offset).split('\n').length;

const findToken = (text: string): Token | null => {
    const [first, second] = text.matchAll(tokenPattern);
    if (!first) {
        return null;
    }
    if (second) {
        throw new GeneratedSignatureMalformedError({
            reason: 'duplicate-signature',
            line: lineOf(text, second.index),
            detail: `signature already defined at line ${lineOf(text, first.index)}`,
        });
    }
    const { version = '', hash = '' } = first.groups!;
    if (version !== VERSION) {
        throw new GeneratedSignatureMalformedError({
            reason: 'unsupported-version',
            line: lineOf(text, first.index),
            detail: `v${version} is not supported, expected v${VERSION}`,
        });
    }
    return {
        hash,
        hashStart: first.index + first[0].length - HASH_LENGTH,
    };
};

const replaceHash = (text: string, token: Token, hash: string): string =>
    text.slice(0, token.hashStart) + hash + text.slice(token.hashStart + HASH_LENGTH);

/**
 * Hash everything except the signature itself and the bodies of manual sections.
 * Line endings are normalized first, so a checkout with `core.autocrlf` still verifies.
 *
 * @param text - file content containing exactly one token
 * @returns hash to embed in the token
 */
const computeHash = (text: string): string => {
    const normalized = text.replaceAll('\r\n', '\n');
    const token = findToken(normalized)!;
    const withPlaceholder = replaceHash(normalized, token, PLACEHOLDER);
    const hashable = replaceBodies(withPlaceholder, scanSections(withPlaceholder), () => '');
    return createHash('sha256').update(hashable).digest('hex').slice(0, HASH_LENGTH);
};

export type SignOptions = CommentOptions & {
    /**
     * Text after the token in an inserted signature line.
     */
    readonly message?: string;
};

/**
 * An unsigned signature token, for generators that place it themselves (e.g. inside their own
 * header comment). `sign()` fills in its hash.
 *
 * @returns token with a placeholder hash
 */
export const signatureToken = (): string => `${TOKEN_NAME} v${VERSION}:${PLACEHOLDER}`;

/**
 * Insert the signature line at the top of the file, after any line (or Markdown front matter) that must stay first.
 *
 * @param text - file content without a token
 * @param options - comment syntax and message to render the line with
 * @returns text with an (unsigned) token line
 */
const insertHeader = (text: string, options: SignOptions): string => {
    const style = resolveCommentStyle(options);
    const lineBreak = text.includes('\r\n') ? '\r\n' : '\n';
    const header =
        renderComment(style, `${signatureToken()} ${options.message ?? DEFAULT_MESSAGE}`) +
        lineBreak;

    // A shebang or XML declaration is only valid on the first line.
    if (text.startsWith('#!') || text.startsWith('<?xml')) {
        const firstLineEnd = text.indexOf('\n');
        return firstLineEnd === -1
            ? text + lineBreak + header
            : text.slice(0, firstLineEnd + 1) + header + text.slice(firstLineEnd + 1);
    }

    // Markdown front matter must start the file too, so the line goes after its closing fence.
    const frontMatter =
        style.start === '<!--' ? /^---\r?\n(?:[^\n]*\n)*?---\r?(?:\n|$)/u.exec(text) : null;
    if (frontMatter) {
        const [fenced] = frontMatter;
        return fenced.endsWith('\n')
            ? fenced + header + text.slice(fenced.length)
            : fenced + lineBreak + header;
    }
    return header + text;
};

/**
 * Sign a generated file.
 *
 * If the text already contains a signature token (e.g. a previous signature, or one the
 * generator placed itself), its hash is replaced. Otherwise a signature line is inserted at the
 * top of the file, using the comment syntax from `options`.
 *
 * @param text - generated file content
 * @param options - comment syntax and message, required only if the text has no token yet
 * @returns signed text
 * @throws {GeneratedSignatureMalformedError} if the token or manual sections are malformed
 * @throws {GeneratedSignatureCommentStyleError} if a line must be inserted for an unknown file type
 */
export const sign = (text: string, options?: SignOptions): string => {
    let withToken = text;
    if (findToken(text) === null) {
        if (!options) {
            throw new TypeError('Text has no signature token, provide `comment` or `filePath`');
        }
        withToken = insertHeader(text, options);
    }
    return replaceHash(withToken, findToken(withToken)!, computeHash(withToken));
};

export type VerifyResult =
    | {
          /**
           * The file has no signature token.
           */
          readonly status: 'unsigned';
      }
    | {
          /**
           * The token's hash does not match, so content outside manual sections was edited.
           */
          readonly status: 'invalid';
      }
    | {
          readonly status: 'malformed';
          readonly error: GeneratedSignatureMalformedError;
      }
    | {
          readonly status: 'valid';
      };

/**
 * Check a file's signature. Only needs the file itself, not the generator that wrote it.
 *
 * Does not check that the file is up to date with its generator's inputs.
 *
 * @param text - file content
 * @returns verification status
 */
export const verify = (text: string): VerifyResult => {
    try {
        const token = findToken(text.replaceAll('\r\n', '\n'));
        if (token === null) {
            return { status: 'unsigned' };
        }
        return { status: computeHash(text) === token.hash ? 'valid' : 'invalid' };
    } catch (err) {
        // Reading the token and sections only throws malformed errors.
        return { status: 'malformed', error: err as GeneratedSignatureMalformedError };
    }
};

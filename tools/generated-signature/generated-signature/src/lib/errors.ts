/**
 * Base class of every error thrown by this package.
 *
 * All instances of this error will be of a subclass with a more specific failure reason.
 */
// eslint-disable-next-line unicorn/custom-error-definition
export abstract class GeneratedSignatureError extends Error {}

export type MalformedReason =
    | 'duplicate-section'
    | 'duplicate-signature'
    | 'invalid-section-id'
    | 'nested-section'
    | 'unclosed-section'
    | 'unopened-section'
    | 'unsupported-version';

/**
 * The file's signature token or manual section markers can't be interpreted.
 */
export class GeneratedSignatureMalformedError extends GeneratedSignatureError {
    public readonly reason: MalformedReason;
    /**
     * 1-indexed line of the offending marker or token.
     */
    public readonly line: number;

    public constructor({
        reason,
        line,
        detail,
    }: {
        reason: MalformedReason;
        line: number;
        detail: string;
    }) {
        super(`Malformed generated file (${reason}) at line ${line}: ${detail}`);
        this.name = 'GeneratedSignatureMalformedError';
        this.reason = reason;
        this.line = line;
    }
}

/**
 * A signature line has to be inserted, but no comment syntax is known for the file.
 */
export class GeneratedSignatureCommentStyleError extends GeneratedSignatureError {
    public readonly filePath: string;

    public constructor(filePath: string) {
        super(`No known comment syntax for ${filePath}, pass a comment style explicitly`);
        this.name = 'GeneratedSignatureCommentStyleError';
        this.filePath = filePath;
    }
}

/**
 * A manual section id can't be used in a marker.
 */
export class GeneratedSignatureSectionIdError extends GeneratedSignatureError {
    public readonly id: string;

    public constructor(id: string) {
        super(`Invalid manual section id "${id}", only letters, digits, "_", "." and "-" allowed`);
        this.name = 'GeneratedSignatureSectionIdError';
        this.id = id;
    }
}

/**
 * A manifest file can't be read.
 */
export class GeneratedSignatureManifestError extends GeneratedSignatureError {
    public constructor(detail: string, options?: ErrorOptions) {
        super(`Invalid generated-signature manifest: ${detail}`, options);
        this.name = 'GeneratedSignatureManifestError';
    }
}

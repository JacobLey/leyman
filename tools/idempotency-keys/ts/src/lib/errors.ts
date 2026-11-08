/**
 * Base of every error `idempotency-keys` throws.
 */
export abstract class IdempotencyKeysError extends Error {}

/**
 * The `Idempotency-Key` header can't be read: more than one header, a malformed Structured Field String, or a key
 * that isn't 1 to 255 characters of `0x20` to `0x7E`. `handle()` answers it with a `400`.
 */
export class IdempotencyKeyHeaderError extends IdempotencyKeysError {
    public readonly values: readonly string[];
    public constructor(values: readonly string[]) {
        super(`Invalid Idempotency-Key header: ${JSON.stringify(values)}`);
        this.name = 'IdempotencyKeyHeaderError';
        this.values = values;
    }
}

/**
 * An option out of range: a duration that isn't a whole number of milliseconds above 0 (`waitMs` may be 0), a
 * `leaseMs` not below `ttlMs`, an empty name or one Postgres can't hold, or a scope, operation or key that is empty or
 * not well-formed Unicode.
 */
export class IdempotencyKeysOptionError extends IdempotencyKeysError {
    public readonly option: string;
    public readonly value: unknown;
    public constructor(option: string, value: unknown, reason: string) {
        super(`Invalid ${option} ${JSON.stringify(value)}: ${reason}`);
        this.name = 'IdempotencyKeysOptionError';
        this.option = option;
        this.value = value;
    }
}

/**
 * A request header value with a character above `U+00FF`, which no HTTP request can hold: `fetch`'s `Headers` gives
 * each byte received as one character up to `U+00FF`, and the fingerprint hashes it back as that byte.
 */
export class IdempotencyKeysHeaderValueError extends IdempotencyKeysError {
    public readonly header: string;
    public readonly value: string;
    public constructor(header: string, value: string) {
        super(`Header ${header} holds a character above U+00FF: ${JSON.stringify(value)}`);
        this.name = 'IdempotencyKeysHeaderValueError';
        this.header = header;
        this.value = value;
    }
}

/**
 * `handle()` was given a request whose body was already read, so it can't be fingerprinted, nor run.
 */
export class IdempotencyKeysBodyUsedError extends IdempotencyKeysError {
    public constructor() {
        super('The request body was already read: handle() needs it unread');
        this.name = 'IdempotencyKeysBodyUsedError';
    }
}

/**
 * The Valkey client gave a stored body back as text, not bytes, which would change a binary body. Give the store an
 * `eval` whose replies are bytes, e.g. ioredis's `callBuffer('EVAL', ...)`.
 */
export class IdempotencyKeysReplyError extends IdempotencyKeysError {
    public constructor() {
        super(
            'The Valkey connection replied with text: its eval must reply with bytes, e.g. ioredis callBuffer'
        );
        this.name = 'IdempotencyKeysReplyError';
    }
}

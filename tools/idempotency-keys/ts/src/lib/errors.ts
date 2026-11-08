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
 * `leaseMs` not below `ttlMs`, or an empty name.
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

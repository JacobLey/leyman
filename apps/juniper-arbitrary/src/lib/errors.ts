/**
 * Base class of every error thrown by this package.
 */
export abstract class JuniperArbitraryError extends Error {
    /**
     * JSON Pointer into the schema (e.g. `#/properties/name`) of the part that caused the error.
     */
    public readonly path: string;

    protected constructor(message: string, path: string) {
        super(`${message} (at ${path})`);
        this.path = path;
    }
}

/**
 * No value can be generated: the schema matches nothing, or nothing that random generation
 * finds within its budget of attempts.
 */
export class UnsatisfiableSchemaError extends JuniperArbitraryError {
    public constructor(message: string, path: string) {
        super(message, path);
        this.name = 'UnsatisfiableSchemaError';
    }
}

/**
 * The schema can't be read without more than it holds, such as a `$ref` to something outside it.
 */
export class UnsupportedSchemaError extends JuniperArbitraryError {
    public constructor(message: string, path: string) {
        super(message, path);
        this.name = 'UnsupportedSchemaError';
    }
}

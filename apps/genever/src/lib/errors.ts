/**
 * Error message, with where in the schema it applies.
 *
 * @param message - description of the problem
 * @param pointer - JSON Pointer to where the problem is
 * @returns message ending with the pointer
 */
const withPointer = (message: string, pointer: string): string => `${message} (at ${pointer})`;

/**
 * Base class of every error genever throws.
 */
export abstract class GeneverError extends Error {
    /**
     * JSON Pointer to the schema (or keyword) that caused the error, e.g. `#/properties/foo`.
     */
    public readonly pointer: string;

    /**
     * @param message - description of the problem
     * @param options - error details
     * @param options.pointer - JSON Pointer to the schema (or keyword) that caused the error
     */
    public constructor(message: string, options: ErrorOptions & { pointer: string }) {
        super(message, options);
        this.name = 'GeneverError';
        this.pointer = options.pointer;
    }
}

/**
 * The input is not a valid JSON Schema, e.g. `properties` is not an object.
 */
export class GeneverInvalidSchemaError extends GeneverError {
    /**
     * @param message - description of the problem
     * @param options - error details
     * @param options.pointer - JSON Pointer to the invalid schema or keyword
     */
    public constructor(message: string, options: ErrorOptions & { pointer: string }) {
        super(withPointer(message, options.pointer), options);
        this.name = 'GeneverInvalidSchemaError';
    }
}

/**
 * The schema is valid, but breaks a strict mode rule, e.g. an unknown keyword.
 * Disable strict mode to generate types anyway.
 */
export class GeneverStrictModeError extends GeneverError {
    /**
     * @param message - description of the problem
     * @param options - error details
     * @param options.pointer - JSON Pointer to the offending schema or keyword
     */
    public constructor(message: string, options: ErrorOptions & { pointer: string }) {
        super(withPointer(message, options.pointer), options);
        this.name = 'GeneverStrictModeError';
    }
}

/**
 * The schema is valid, but uses a feature genever can't generate types for, e.g. a `$ref` to another file.
 */
export class GeneverUnsupportedError extends GeneverError {
    /**
     * @param message - description of the problem
     * @param options - error details
     * @param options.pointer - JSON Pointer to the unsupported schema or keyword
     */
    public constructor(message: string, options: ErrorOptions & { pointer: string }) {
        super(withPointer(message, options.pointer), options);
        this.name = 'GeneverUnsupportedError';
    }
}

/**
 * A file or URL the schema references could not be loaded.
 */
export class GeneverLoadError extends GeneverError {
    /**
     * @param message - description of the problem
     * @param options - error details
     * @param options.pointer - JSON Pointer to the document whose references failed to load
     */
    public constructor(message: string, options: ErrorOptions & { pointer: string }) {
        super(withPointer(message, options.pointer), options);
        this.name = 'GeneverLoadError';
    }
}

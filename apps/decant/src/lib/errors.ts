/**
 * Error message, with where in the schema it applies.
 *
 * @param message - description of the problem
 * @param pointer - JSON Pointer to where the problem is
 * @returns message ending with the pointer
 */
const withPointer = (message: string, pointer: string): string => `${message} (at ${pointer})`;

/**
 * Base class of every error decant throws.
 */
export abstract class DecantError extends Error {
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
        this.name = 'DecantError';
        this.pointer = options.pointer;
    }
}

/**
 * The input is not a valid JSON Schema, e.g. `properties` is not an object.
 */
export class DecantInvalidSchemaError extends DecantError {
    /**
     * @param message - description of the problem
     * @param options - error details
     * @param options.pointer - JSON Pointer to the invalid schema or keyword
     */
    public constructor(message: string, options: ErrorOptions & { pointer: string }) {
        super(withPointer(message, options.pointer), options);
        this.name = 'DecantInvalidSchemaError';
    }
}

/**
 * The schema is valid, but breaks a strict mode rule, e.g. an unknown keyword.
 * Disable strict mode to generate types anyway.
 */
export class DecantStrictModeError extends DecantError {
    /**
     * @param message - description of the problem
     * @param options - error details
     * @param options.pointer - JSON Pointer to the offending schema or keyword
     */
    public constructor(message: string, options: ErrorOptions & { pointer: string }) {
        super(withPointer(message, options.pointer), options);
        this.name = 'DecantStrictModeError';
    }
}

/**
 * The schema is valid, but uses a feature decant can't generate types for, e.g. a `$ref` to another file.
 */
export class DecantUnsupportedError extends DecantError {
    /**
     * @param message - description of the problem
     * @param options - error details
     * @param options.pointer - JSON Pointer to the unsupported schema or keyword
     */
    public constructor(message: string, options: ErrorOptions & { pointer: string }) {
        super(withPointer(message, options.pointer), options);
        this.name = 'DecantUnsupportedError';
    }
}

/**
 * A file or URL the schema references could not be loaded.
 */
export class DecantLoadError extends DecantError {
    /**
     * @param message - description of the problem
     * @param options - error details
     * @param options.pointer - JSON Pointer to the document whose references failed to load
     */
    public constructor(message: string, options: ErrorOptions & { pointer: string }) {
        super(withPointer(message, options.pointer), options);
        this.name = 'DecantLoadError';
    }
}

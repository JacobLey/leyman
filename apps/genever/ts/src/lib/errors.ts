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
     * JSON Pointer to the schema (or keyword) that caused the error, as a URI fragment, e.g. `#/properties/foo`.
     * Each key has `~` escaped as `~0` and `/` as `~1`, then is percent-encoded (RFC 6901 §6,
     * https://www.rfc-editor.org/rfc/rfc6901#section-6), so the property `a/b c` is `#/properties/a~1b%20c`, which
     * is also a `$ref` to it. In another OpenAPI document, or file of OpenAPI objects, it starts with that file's URI,
     * e.g. `file:///api/common.yaml#/components/schemas/Error`.
     *
     * Of several errors, the one reported is the first found: keywords are checked in a fixed order, and the members
     * of an object (properties, definitions, paths...) in the UTF-16 code unit order of their keys (RFC 8785 §3.2.3,
     * https://www.rfc-editor.org/rfc/rfc8785#section-3.2.3), not the order they are written in.
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
     * URI of the file or URL with the `$ref` that needed it, which `pointer` is in: the input, or a file it loaded.
     */
    public readonly referencedFrom: string;

    /**
     * @param message - description of the problem
     * @param options - error details
     * @param options.pointer - JSON Pointer to the `$ref` that needed it
     * @param options.referencedFrom - URI of the file or URL the `$ref` is in
     */
    public constructor(
        message: string,
        options: ErrorOptions & { pointer: string; referencedFrom: string }
    ) {
        super(withPointer(message, options.pointer), options);
        this.name = 'GeneverLoadError';
        this.referencedFrom = options.referencedFrom;
    }
}

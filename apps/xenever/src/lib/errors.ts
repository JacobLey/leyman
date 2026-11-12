/**
 * Where in an XML document something is.
 */
export interface XmlLocation {
    /**
     * Line number, 1-based. A line ends at `\n`, `\r\n` or a lone `\r`, the line breaks XML normalizes
     * ([XML 1.0 §2.11](https://www.w3.org/TR/xml/#sec-line-ends)), so `\r\n` is one line break.
     */
    readonly line: number;
    /**
     * Column, 1-based, counted in UTF-16 code units from the start of the line (as `offset` is).
     */
    readonly column: number;
    /**
     * Offset from the start of the input string, 0-based, in UTF-16 code units: `xml[offset]` is the first
     * character of the node (`<` of an element, the first character of an attribute's name).
     */
    readonly offset: number;
}

/**
 * Where in an XML document an error is: its location, and the path to the element or attribute.
 */
export interface XmlErrorLocation extends XmlLocation {
    /**
     * Path to the element or attribute, e.g. `/order/item[2]/@sku`. Each step is the name as written in the
     * document, prefix included. `[n]` (1-based) follows an element name only when its parent has more than one
     * child element written with that name, so the root is always `/order`. `/` alone is the document, for
     * errors that aren't about one element, such as a DOCTYPE or not well-formed XML.
     */
    readonly path: string;
}

/**
 * Error message, with where in the document it applies.
 *
 * @param message - description of the problem
 * @param location - where the problem is
 * @returns message ending with the path, line and column
 */
const withLocation = (message: string, location: XmlErrorLocation): string =>
    `${message} (at ${location.path}, line ${location.line}, column ${location.column})`;

/**
 * Error message, with where in the schema it applies.
 *
 * @param message - description of the problem
 * @param path - path to the construct
 * @returns message ending with the path
 */
const withPath = (message: string, path: string): string => `${message} (at ${path})`;

/**
 * Base class of every error xenever throws.
 */
export abstract class XeneverError extends Error {
    /**
     * @param message - description of the problem
     * @param options - the error's `cause`, if any
     */
    public constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'XeneverError';
    }
}

/**
 * Base class of the errors about an XML document, which say where in it the problem is.
 */
export abstract class XeneverDocumentError extends XeneverError implements XmlErrorLocation {
    public readonly line: number;
    public readonly column: number;
    public readonly offset: number;
    public readonly path: string;

    /**
     * @param message - description of the problem
     * @param options - error options, and where the problem is
     */
    public constructor(message: string, options: ErrorOptions & XmlErrorLocation) {
        super(withLocation(message, options), options);
        this.name = 'XeneverDocumentError';
        this.line = options.line;
        this.column = options.column;
        this.offset = options.offset;
        this.path = options.path;
    }
}

/**
 * The document is not namespace-well-formed XML, e.g. a missing end tag or an undeclared prefix, or uses
 * something xenever never accepts, such as a DOCTYPE. A not well-formed error from the tokenizer is the `cause`.
 */
export class XeneverXmlError extends XeneverDocumentError {
    /**
     * @param message - description of the problem
     * @param options - error options, and where the problem is
     */
    public constructor(message: string, options: ErrorOptions & XmlErrorLocation) {
        super(message, options);
        this.name = 'XeneverXmlError';
    }
}

/**
 * The document is well-formed XML, but doesn't match the schema, e.g. an unknown element or a missing attribute.
 */
export class XeneverValidationError extends XeneverDocumentError {
    /**
     * @param message - description of the problem
     * @param options - error options, and where the problem is
     */
    public constructor(message: string, options: ErrorOptions & XmlErrorLocation) {
        super(message, options);
        this.name = 'XeneverValidationError';
    }
}

/**
 * The schema is not valid: a schema value xenever can't use, or an XSD that breaks the XML Schema rules.
 */
export class XeneverInvalidSchemaError extends XeneverError {
    /**
     * Path to the invalid construct in the schema.
     */
    public readonly path: string;

    /**
     * @param message - description of the problem
     * @param options - error details
     * @param options.path - path to the invalid construct in the schema
     */
    public constructor(message: string, options: ErrorOptions & { path: string }) {
        super(withPath(message, options.path), options);
        this.name = 'XeneverInvalidSchemaError';
        this.path = options.path;
    }
}

/**
 * The XSD is valid, but uses a construct xenever doesn't support, e.g. a substitution group.
 */
export class XeneverUnsupportedError extends XeneverError {
    /**
     * Path to the unsupported construct in the schema.
     */
    public readonly path: string;

    /**
     * @param message - description of the problem
     * @param options - error details
     * @param options.path - path to the unsupported construct in the schema
     */
    public constructor(message: string, options: ErrorOptions & { path: string }) {
        super(withPath(message, options.path), options);
        this.name = 'XeneverUnsupportedError';
        this.path = options.path;
    }
}

/**
 * A file the importer needs, such as an XSD or one it includes or imports, could not be read.
 */
export class XeneverLoadError extends XeneverError {
    /**
     * Path of the file that could not be read.
     */
    public readonly filePath: string;

    /**
     * @param message - description of the problem
     * @param options - error details
     * @param options.filePath - path of the file that could not be read
     */
    public constructor(message: string, options: ErrorOptions & { filePath: string }) {
        super(withPath(message, options.filePath), options);
        this.name = 'XeneverLoadError';
        this.filePath = options.filePath;
    }
}

import type { Node } from 'yaml';
import type { MapperOptions } from './options.js';
import { pathToFileURL } from 'node:url';
import { isAlias, isMap, isNode, isPair, isScalar, isSeq, parseDocument, YAMLError } from 'yaml';
import {
    genever,
    GeneverError,
    GeneverStrictModeError,
    GeneverUnsupportedError,
    parseYaml,
} from 'genever';

/**
 * An error in the mapped document, located in its text.
 */
export interface DocumentDiagnostic {
    readonly messageText: string;
    /**
     * Offset in the document's text, in UTF-16 code units (JavaScript string indices).
     */
    readonly start: number;
    readonly length: number;
    readonly code: number;
}

/**
 * The types of a mapped document, or why there are none.
 */
export interface MappedDocument {
    /**
     * TypeScript source: genever's types, or an empty module if the document has errors.
     */
    readonly text: string;
    readonly diagnostics: readonly DocumentDiagnostic[];
}

/**
 * Diagnostic codes, one per kind of problem.
 */
const unexpected = 100;
const syntax = 101;
const invalidSchema = 102;
const strictMode = 103;
const unsupported = 104;

/**
 * Diagnostic codes, one per kind of problem. TypeScript shows them after the `genever` prefix, e.g. `genever103`.
 */
export const diagnosticCodes = {
    unexpected,
    syntax,
    invalidSchema,
    strictMode,
    unsupported,
} as const;

const emptyModule = 'export {};\n';

/**
 * Decode a JSON Pointer fragment (`#/paths/~1notes/get`) into its keys. Every pointer is into the document itself,
 * since nothing else is loaded.
 *
 * @param pointer - JSON Pointer, as a URI fragment
 * @returns keys from the document root
 */
const pointerKeys = (pointer: string): string[] =>
    pointer
        .split('/')
        .slice(1)
        .map(key => decodeURIComponent(key).replaceAll('~1', '/').replaceAll('~0', '~'));

type Span = readonly [start: number, end: number];

/**
 * Where a parsed node is in the text. The parser sets every node's range.
 *
 * @param node - parsed node
 * @returns its range, without trailing comments and whitespace
 */
const rangeOf = (node: Node): Span => {
    const [start, end] = node.range!;
    return [start, end];
};

/**
 * Find where a JSON Pointer points in the document's text.
 *
 * @param text - the document's contents
 * @param pointer - JSON Pointer from a genever error
 * @returns range of the entry (key and value) or item the pointer ends at, or of its deepest ancestor in the text
 */
const locate = (text: string, pointer: string): { start: number; length: number } => {
    const document = parseDocument(text, { merge: true, stringKeys: true });
    let node: unknown = document.contents;
    let [start, end] = isNode(node) ? rangeOf(node) : [0, text.length];
    for (const key of pointerKeys(pointer)) {
        if (isAlias(node)) {
            node = node.resolve(document);
        }
        const pair = isMap(node)
            ? node.items.find(item => isScalar(item.key) && String(item.key.value) === key)
            : undefined;
        const item: unknown = pair ?? (isSeq(node) ? node.items[Number(key)] : undefined);
        if (isPair(item)) {
            [start] = rangeOf(item.key as Node);
            [, end] = rangeOf(isNode(item.value) ? item.value : (item.key as Node));
            node = item.value;
        } else if (isNode(item)) {
            [start, end] = rangeOf(item);
            node = item;
        } else {
            break;
        }
    }
    return { start, length: end - start };
};

/**
 * Describe why a document has no types.
 *
 * @param text - the document's contents
 * @param error - what parsing or generating its types threw
 * @returns diagnostic, located in the document
 */
const diagnose = (text: string, error: unknown): DocumentDiagnostic => {
    if (error instanceof YAMLError) {
        const [start, end] = error.pos;
        return { start, messageText: error.message, length: end - start, code: syntax };
    }
    if (error instanceof GeneverError) {
        let code: number = invalidSchema;
        if (error instanceof GeneverStrictModeError) {
            code = strictMode;
        } else if (error instanceof GeneverUnsupportedError) {
            code = unsupported;
        }
        return { messageText: error.message, ...locate(text, error.pointer), code };
    }
    // Reported in the document rather than failing the transform, which TypeScript reports without the message
    return { messageText: String(error), start: 0, length: 0, code: unexpected };
};

/**
 * Generate the types of an OpenAPI document or JSON Schema, as TypeScript source for the compiler.
 *
 * The document is read as YAML, so JSON works too. It must be self-contained: a `$ref` to another file or a
 * URL is an error, since TypeScript would not run the mapper again when that file changes.
 *
 * @param text - the document's contents
 * @param fileName - absolute path of the document, which `$id`s and `$ref`s resolve against
 * @param options - genever's options
 * @returns the types, or diagnostics in the document's text
 */
export const mapDocument = (
    text: string,
    fileName: string,
    options: MapperOptions = {}
): MappedDocument => {
    try {
        const baseUri = pathToFileURL(fileName).href;
        return { text: genever(parseYaml(text), { ...options, baseUri }), diagnostics: [] };
    } catch (error) {
        return { text: emptyModule, diagnostics: [diagnose(text, error)] };
    }
};

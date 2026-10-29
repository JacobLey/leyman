import type { Document, Node, Pair, Scalar, YAMLMap } from 'yaml';
import type { MapperOptions } from './options.js';
import { pathToFileURL } from 'node:url';
import { isAlias, isMap, isNode, isPair, isSeq, parseDocument, YAMLError } from 'yaml';
import {
    GeneverError,
    geneverSource,
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
 * A segment of TypeScript's span map: `[virtualStart, virtualLength, originalStart, originalLength, kind]`, from a
 * span of the types to a span of the document, in UTF-16 code units. Kind `2` (alias) says both are names of the
 * same thing, so go to definition, hover and find references cross between them.
 */
export type Mapping = readonly [
    virtualStart: number,
    virtualLength: number,
    originalStart: number,
    originalLength: number,
    kind: typeof aliasKind,
];

const aliasKind = 2;

/**
 * The types of a mapped document, or why there are none.
 */
export interface MappedDocument {
    /**
     * TypeScript source: genever's types, or an empty module if the document has errors.
     */
    readonly text: string;
    readonly diagnostics: readonly DocumentDiagnostic[];
    /**
     * Each type's and property's name, mapped to the key of its schema (or of `paths`) in the document, in the
     * order of the names in `text`.
     */
    readonly mappings: readonly Mapping[];
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

const parseLocated = (text: string): Document =>
    parseDocument(text, { merge: true, stringKeys: true });

const mergeKey = '<<';

/**
 * Each map's entries by key, built once per map.
 */
const entryIndex = new WeakMap<YAMLMap, ReadonlyMap<string, Pair>>();

/**
 * A map's entries by key, as the parsed value has them: its own, then those its merge keys (`<<: *base`) bring
 * in, an earlier merged map's before a later one's. A quoted `"<<"` is an ordinary key.
 *
 * @param map - parsed map
 * @param document - the parsed document, which aliases resolve in
 * @returns entries by key
 */
const entriesOf = (map: YAMLMap, document: Document): ReadonlyMap<string, Pair> => {
    const indexed = entryIndex.get(map);
    if (indexed) {
        return indexed;
    }
    const entries = new Map<string, Pair>();
    // Before merging, so a map merging itself finds what it has so far rather than recursing
    entryIndex.set(map, entries);
    const merged: unknown[] = [];
    for (const item of map.items) {
        // Every key is a string, or genever would have refused the document
        const key = String((item.key as Scalar).value);
        if (key === mergeKey && (item.key as Scalar).type === 'PLAIN') {
            const value = isAlias(item.value) ? item.value.resolve(document) : item.value;
            merged.push(...(isSeq(value) ? value.items : [value]));
        } else if (!entries.has(key)) {
            entries.set(key, item);
        }
    }
    for (const source of merged) {
        const resolved = isAlias(source) ? source.resolve(document) : source;
        if (isMap(resolved)) {
            for (const [key, pair] of entriesOf(resolved, document)) {
                if (!entries.has(key)) {
                    entries.set(key, pair);
                }
            }
        }
    }
    return entries;
};

/**
 * Where a JSON Pointer points in the document's text.
 */
interface Located {
    /**
     * Range of the entry (key and value) or item the pointer ends at, or of its deepest ancestor in the text.
     */
    readonly entry: Span;
    /**
     * Range of the key the pointer ends at, if every key is in the text and the last is an entry's.
     */
    readonly key: Span | null;
}

/**
 * Find where a JSON Pointer points in the document's text.
 *
 * @param document - the parsed document
 * @param textLength - length of the document's text
 * @param pointer - JSON Pointer from genever
 * @returns ranges of the entry, and of its key
 */
const find = (document: Document, textLength: number, pointer: string): Located => {
    let node: unknown = document.contents;
    let entry: Span = isNode(node) ? rangeOf(node) : [0, textLength];
    let key: Span | null = null;
    for (const segment of pointerKeys(pointer)) {
        if (isAlias(node)) {
            node = node.resolve(document);
        }
        const pair = isMap(node) ? entriesOf(node, document).get(segment) : undefined;
        const item: unknown = pair ?? (isSeq(node) ? node.items[Number(segment)] : undefined);
        if (isPair(item)) {
            key = rangeOf(item.key as Node);
            entry = [key[0], rangeOf(isNode(item.value) ? item.value : (item.key as Node))[1]];
            node = item.value;
        } else if (isNode(item)) {
            key = null;
            entry = rangeOf(item);
            node = item;
        } else {
            return { entry, key: null };
        }
    }
    return { entry, key };
};

/**
 * Find where a JSON Pointer points in the document's text.
 *
 * @param text - the document's contents
 * @param pointer - JSON Pointer from a genever error
 * @returns range of the entry (key and value) or item the pointer ends at, or of its deepest ancestor in the text
 */
const locate = (text: string, pointer: string): { start: number; length: number } => {
    const [start, end] = find(parseLocated(text), text.length, pointer).entry;
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
 * @returns the types, with each name mapped to its schema's key, or diagnostics in the document's text
 */
export const mapDocument = (
    text: string,
    fileName: string,
    options: MapperOptions = {}
): MappedDocument => {
    try {
        const baseUri = pathToFileURL(fileName).href;
        const source = geneverSource(parseYaml(text), { ...options, baseUri });
        const document = parseLocated(text);
        const mappings = source.names.flatMap(({ name, pointer, start }): Mapping[] => {
            const { key } = find(document, text.length, pointer);
            return key ? [[start, name.length, key[0], key[1] - key[0], aliasKind]] : [];
        });
        return { text: source.text, diagnostics: [], mappings };
    } catch (error) {
        return { text: emptyModule, diagnostics: [diagnose(text, error)], mappings: [] };
    }
};

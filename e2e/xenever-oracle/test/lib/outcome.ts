import type { XsdSchemaSet } from 'xenever/xsd';
import { readFile } from 'node:fs/promises';
import {
    parse,
    x,
    XeneverInvalidSchemaError,
    XeneverLoadError,
    XeneverUnsupportedError,
    XeneverValidationError,
    XeneverXmlError,
} from 'xenever';
import { loadXsd } from 'xenever/xsd';
import { decodeXml } from './decode.js';

/**
 * What xenever made of a schema or document: accepted it, or which error it threw.
 */
export type Outcome = 'invalid' | 'load' | 'unsupported' | 'valid' | 'xml';

/**
 * An outcome, with the message of the error when xenever threw one.
 */
export interface Result {
    readonly outcome: Outcome;
    readonly message?: string | undefined;
}

/**
 * The outcome an error stands for. Anything but a xenever error of an expected kind is a crash, rethrown.
 *
 * @param error - what was thrown
 * @param invalid - the error class that means "invalid" here
 * @returns its outcome
 * @throws {unknown} the error, when it is none of those
 */
const resultOf = (error: unknown, invalid: abstract new (...args: never[]) => Error): Result => {
    const kinds: readonly (readonly [abstract new (...args: never[]) => Error, Outcome])[] = [
        [XeneverUnsupportedError, 'unsupported'],
        [XeneverXmlError, 'xml'],
        [XeneverLoadError, 'load'],
        [invalid, 'invalid'],
    ];
    const kind = kinds.find(([errorClass]) => error instanceof errorClass);
    if (kind === undefined) {
        throw error;
    }
    return { outcome: kind[1], message: (error as Error).message };
};

/**
 * Reads a file as `loadXsd` and `parse` should see it: decoded as an XML processor would.
 *
 * @param path - the file
 * @returns its text
 */
export const readXml = async (path: string): Promise<string> => decodeXml(await readFile(path));

/**
 * Loads an XSD with xenever.
 *
 * @param path - the entry schema document
 * @returns the schema set, or the result of the error
 */
export const loadOutcome = async (path: string): Promise<Result | XsdSchemaSet> => {
    try {
        return await loadXsd(path, { readFile: readXml, bigint: true });
    } catch (error) {
        return resultOf(error, XeneverInvalidSchemaError);
    }
};

/**
 * Content allowing any elements, unvalidated.
 */
const anyContent = x.sequence([x.any({ minOccurs: 0, maxOccurs: 'unbounded' })]);

/**
 * Parses a document with the global element of a schema set its root names: `invalid` when there is none,
 * as for any validator ([cvc-elt.1](https://www.w3.org/TR/xmlschema-1/#cvc-elt)).
 *
 * @param text - the document
 * @param set - the schema set
 * @param root - namespace and local name of the document's root element, `null` when it has none
 * @param root.namespace - the root's namespace URI, `null` for none
 * @param root.localName - what follows the prefix in the root's tag, or all of it
 * @returns `valid`, or what the error `parse` threw means
 */
export const parseOutcome = (
    text: string,
    set: XsdSchemaSet,
    root: { readonly namespace: string | null; readonly localName: string } | null
): Result => {
    const element = set.elements.find(
        candidate =>
            root !== null &&
            candidate.name === root.localName &&
            (candidate.namespace ?? null) === root.namespace
    );
    const rootNamespace = root?.namespace ?? null;
    const noDeclaration: Result = {
        outcome: 'invalid',
        message: 'No global element declaration matches the root',
    };
    try {
        // Without a declaration, still parsed, with an element of the root's name and any content, so a document
        // that is not well-formed is an XML error and one with `xsi:type` on its root is unsupported.
        parse(
            text,
            element ??
                x.element(root?.localName ?? 'none', x.complex({ content: anyContent }), {
                    ...(rootNamespace !== null && { namespace: rootNamespace }),
                })
        );
        return element ? { outcome: 'valid' } : noDeclaration;
    } catch (error) {
        const result = resultOf(error, XeneverValidationError);
        return element || result.outcome !== 'invalid' ? result : noDeclaration;
    }
};

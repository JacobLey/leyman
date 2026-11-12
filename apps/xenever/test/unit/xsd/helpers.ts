import type { XeneverSchemaError } from 'xenever';
import type { LoadXsdOptions, XsdSchemaSet } from 'xenever/xsd';
import { expect } from '@leyman/expect';
import { loadXsd } from 'xenever/xsd';

/**
 * Namespace name of XML Schema.
 */
export const xs = 'http://www.w3.org/2001/XMLSchema';

/**
 * Path of the XSD that `loadFiles` loads.
 */
export const mainPath = '/schemas/main.xsd';

/**
 * Writes an XSD.
 *
 * @param body - the children of `xs:schema`
 * @param attributes - more attributes of `xs:schema`
 * @returns the XSD
 */
export const schema = (body: string, attributes = ''): string =>
    `<xs:schema xmlns:xs="${xs}" ${attributes}>${body}</xs:schema>`;

/**
 * Loads XSDs from memory, starting with `mainPath`.
 *
 * @param files - texts by absolute path
 * @param options - more options
 * @returns the schema set
 */
export const loadFiles = async (
    files: Readonly<Record<string, string>>,
    options: Omit<LoadXsdOptions, 'readFile'> = {}
): Promise<XsdSchemaSet> =>
    loadXsd(mainPath, {
        ...options,
        readFile: async path => {
            if (!Object.hasOwn(files, path)) {
                throw new Error(`No file ${path}`);
            }
            return files[path]!;
        },
    });

/**
 * Loads one XSD from memory.
 *
 * @param body - the children of `xs:schema`
 * @param attributes - more attributes of `xs:schema`
 * @param options - more options
 * @returns the schema set
 */
export const loadSchema = async (
    body: string,
    attributes = '',
    options: Omit<LoadXsdOptions, 'readFile'> = {}
): Promise<XsdSchemaSet> => loadFiles({ [mainPath]: schema(body, attributes) }, options);

/**
 * Asserts loading rejects with a schema error.
 *
 * @param loading - a call of `loadXsd`
 * @param errorClass - the class the error is an instance of
 * @param reason - matches its message
 * @param location - properties of its location it has
 * @returns what it rejected with
 */
export const expectSchemaError = async (
    loading: Promise<unknown>,
    errorClass: abstract new (...args: never[]) => XeneverSchemaError,
    reason: RegExp,
    location: Readonly<Record<string, number | string>> = {}
): Promise<XeneverSchemaError> => {
    const error = (await expect(loading).to.be.rejectedWith(
        errorClass as unknown as ErrorConstructor,
        reason
    )) as unknown as XeneverSchemaError;
    expect(error).to.include(location);
    return error;
};

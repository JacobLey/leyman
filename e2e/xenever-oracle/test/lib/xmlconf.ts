import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { parseXml, XmlElement } from '@rgrove/parse-xml';
import { parse, x, XeneverXmlError } from 'xenever';
import { decodeXml } from './decode.js';

/**
 * A test of the W3C XML conformance suite that `parse` runs.
 */
export interface XmlTest {
    readonly id: string;
    /**
     * Path of the document, from the suite's root.
     */
    readonly path: string;
    /**
     * Which set it is in: a document that is not well-formed XML 1.0, or a test of Namespaces in XML 1.0.
     */
    readonly set: 'namespaces' | 'not-wf';
    /**
     * What the suite says of it: `not-wf` is not well-formed (or not namespace-well-formed); `valid`, `invalid`
     * and `error` are well-formed.
     */
    readonly type: 'error' | 'invalid' | 'not-wf' | 'valid';
}

/**
 * What `parse` made of a document.
 */
export type XmlOutcome = 'accepted' | 'xml error';

/**
 * A `TEST` element of the suite, as a test `parse` runs: a not-well-formed document of XML 1.0 Fifth Edition
 * read with namespaces, or any test of Namespaces in XML 1.0.
 *
 * @param file - the contributor's file of test cases, from the suite's root
 * @param element - its `TEST` element, whose attributes describe it
 * @returns the test, `null` when it isn't one of those
 */
const toTest = (file: string, element: XmlElement): XmlTest | null => {
    const attribute = (name: string): string | undefined => element.attributes[name];
    const recommendation = attribute('RECOMMENDATION') ?? 'XML1.0';
    const version = attribute('VERSION');
    const edition = attribute('EDITION');
    const type = attribute('TYPE') as XmlTest['type'];
    const isNamespaces = recommendation === 'NS1.0' || recommendation === 'NS1.0-errata1e';
    const isXml10 = recommendation.startsWith('XML1.0') && (version ?? '1.0') === '1.0';
    const isFifth = edition === undefined || edition.split(' ').includes('5');
    const isNotWf = isXml10 && isFifth && attribute('NAMESPACE') !== 'no' && type === 'not-wf';
    if (!isNamespaces && !isNotWf) {
        return null;
    }
    return {
        id: attribute('ID')!,
        path: Path.join(Path.dirname(file), attribute('URI')!),
        set: isNamespaces ? 'namespaces' : 'not-wf',
        type,
    };
};

/**
 * The `TEST` elements in an element, at any depth.
 *
 * @param element - an element of a file of test cases
 * @returns its `TEST` elements, in document order
 */
const testElements = (element: XmlElement): XmlElement[] =>
    element.children
        .filter(child => child instanceof XmlElement)
        .flatMap(child => (child.name === 'TEST' ? [child] : testElements(child)));

/**
 * Reads the tests that apply to `parse`: every not-well-formed document of XML 1.0 Fifth Edition, read with
 * namespaces, and every test of Namespaces in XML 1.0. XML 1.1 tests, tests only of earlier editions and
 * tests of documents read without namespaces are left out: `parse` reads namespace-aware XML 1.0 Fifth
 * Edition.
 *
 * @param root - directory of the suite (`xmlconf/`)
 * @returns the tests that apply
 */
export const readXmlTests = async (root: string): Promise<XmlTest[]> => {
    const index = await readFile(Path.join(root, 'xmlconf.xml'), 'utf8');
    // The index includes each contributor's test cases as an external entity, which parse-xml doesn't read.
    const files = index
        .matchAll(/<!ENTITY\s+[\w\-.]+\s+SYSTEM\s+"(?<path>[^"]+)">/gv)
        .map(match => match.groups!.path!)
        .toArray();
    const tests: XmlTest[] = [];
    for (const file of files) {
        const contents = await readFile(Path.join(root, file), 'utf8');
        // Some contributors' files are a run of `TEST` elements without a root, as an entity may be.
        const cases = parseXml(`<cases>${contents.replace(/^<\?xml[^>]*\?>/v, '')}</cases>`).root!;
        for (const element of testElements(cases)) {
            const test = toTest(file, element);
            if (test) {
                tests.push(test);
            }
        }
    }
    return tests;
};

/**
 * A root that allows any content, so only an error of the XML itself can make `parse` throw an XML error.
 */
const permissive = x.element(
    'xenever-any',
    x.complex({
        mixed: true,
        content: x.sequence([x.any({ minOccurs: 0, maxOccurs: 'unbounded' })]),
        attributes: [x.anyAttribute()],
    })
);

/**
 * Parses a test's document with `parse`. Its root is never `xenever-any`, so a well-formed document fails
 * validation: `parse` reads the whole document before validating it.
 *
 * @param root - directory of the suite
 * @param test - the test to run
 * @returns whether `parse` threw a XeneverXmlError
 * @rejects {Error} whatever `parse` threw besides a xenever error, which is a crash
 */
export const runXmlTest = async (root: string, test: XmlTest): Promise<XmlOutcome> => {
    const bytes = await readFile(Path.join(root, test.path));
    let text: string;
    try {
        text = decodeXml(bytes);
    } catch {
        // Bytes no decoder reads are not an XML document: what an XML processor reports as a fatal error.
        return 'xml error';
    }
    try {
        parse(text, permissive);
    } catch (error) {
        if (error instanceof XeneverXmlError) {
            return 'xml error';
        }
        if (!(Error.isError(error) && error.name.startsWith('Xenever'))) {
            throw error;
        }
    }
    return 'accepted';
};

/**
 * Whether a document has a document type declaration, which `parse` rejects as an XML error.
 *
 * @param root - directory of the suite
 * @param test - the test to look at
 * @returns whether it has one, `false` when it can't be decoded
 */
export const hasDoctype = async (root: string, test: XmlTest): Promise<boolean> => {
    const bytes = await readFile(Path.join(root, test.path));
    try {
        return decodeXml(bytes).includes('<!DOCTYPE');
    } catch {
        return false;
    }
};

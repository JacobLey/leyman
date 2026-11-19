import type { XmlLocation } from '#internal/lib/errors.js';
import { XeneverXmlError } from '#internal/lib/errors.js';

/**
 * Finds the line and column of an offset in the input.
 */
export type Locate = (offset: number) => XmlLocation;

/**
 * Line breaks as XML normalizes them ([XML 1.0 §2.11](https://www.w3.org/TR/xml/#sec-line-ends)):
 * `\r\n` is one break, and a lone `\r` is one too.
 */
const lineBreak = /\r\n?|\n/gv;

/**
 * Indexes where each line of `xml` starts, to locate offsets by binary search.
 *
 * @param xml - input string
 * @returns line and column of an offset
 */
export const createLocate = (xml: string): Locate => {
    const lineStarts = [0];
    for (const match of xml.matchAll(lineBreak)) {
        lineStarts.push(match.index + match[0].length);
    }
    return offset => {
        // Last line starting at or before the offset.
        let low = 0;
        let high = lineStarts.length - 1;
        while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            if (lineStarts[middle]! <= offset) {
                low = middle;
            } else {
                high = middle - 1;
            }
        }
        return { line: low + 1, column: offset - lineStarts[low]! + 1, offset };
    };
};

/**
 * Offset just past the next `terminator` at or after `from`.
 *
 * @param xml - input string
 * @param terminator - string that ends the construct
 * @param from - where to start searching
 * @returns offset after the terminator, or -1 when there is none
 */
const after = (xml: string, terminator: string, from: number): number => {
    const index = xml.indexOf(terminator, from);
    return index === -1 ? -1 : index + terminator.length;
};

/**
 * A start or end tag up to its `>`, skipping quoted attribute values, which may contain `>`. Each alternative
 * starts with a different character, so matching is linear.
 */
const tag = /(?:[^"'>]|"[^"]*"|'[^']*')*>/vy;

/**
 * Rejects any DOCTYPE before the tokenizer runs, since the tokenizer would read one. Only markup is scanned:
 * comments, CDATA sections, processing instructions and tags are skipped whole, so `<!DOCTYPE` in them is not
 * a DOCTYPE. The first construct that isn't closed stops the scan, leaving the tokenizer to report the document
 * as not well-formed.
 *
 * @param xml - input string
 * @param locate - locates offsets in `xml`
 * @throws {XeneverXmlError} on a DOCTYPE
 */
export const rejectDoctype = (xml: string, locate: Locate): void => {
    let index = xml.indexOf('<');
    while (index !== -1) {
        let next: number;
        if (xml.startsWith('<!--', index)) {
            next = after(xml, '-->', index);
        } else if (xml.startsWith('<![CDATA[', index)) {
            next = after(xml, ']]>', index);
        } else if (xml.startsWith('<?', index)) {
            next = after(xml, '?>', index);
        } else if (xml.startsWith('<!DOCTYPE', index)) {
            // A DTD can declare entities (billion laughs, external entities) and attribute defaults that change
            // what the document means. Typed data never needs one, so none is accepted, even an empty one.
            throw new XeneverXmlError('A DOCTYPE is not allowed', { ...locate(index), path: '/' });
        } else {
            tag.lastIndex = index;
            next = tag.test(xml) ? tag.lastIndex : -1;
        }
        if (next === -1) {
            return;
        }
        index = xml.indexOf('<', next);
    }
};

/**
 * One attribute of a start tag: the whitespace before it, its name, `=` and its quoted value.
 */
const attribute = /(?<space>[\t\n\r ]+)[^\t\n\r =]+[\t\n\r ]*=[\t\n\r ]*(?:"[^"]*"|'[^']*')/vy;

/**
 * Offsets of each attribute's name in a start tag, which the tokenizer doesn't report. Only run on a start
 * tag the tokenizer accepted, so it can rely on its syntax.
 *
 * @param xml - input string
 * @param offset - offset of the start tag's `<`
 * @param elementName - element name as written
 * @param attributeNames - attribute names as written, in document order
 * @returns offset of each attribute's name
 */
export const locateAttributes = (
    xml: string,
    offset: number,
    elementName: string,
    attributeNames: readonly string[]
): ReadonlyMap<string, number> => {
    const offsets = new Map<string, number>();
    attribute.lastIndex = offset + 1 + elementName.length;
    for (const name of attributeNames) {
        const match = attribute.exec(xml)!;
        offsets.set(name, match.index + match.groups!.space!.length);
    }
    return offsets;
};

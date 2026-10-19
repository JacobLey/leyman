import { GeneratedSignatureMalformedError } from './errors.js';

export interface ManualSection {
    readonly id: string;
    /**
     * Everything between the marker lines, including the final line break (empty if none).
     */
    readonly body: string;
    /**
     * 1-indexed line of the start marker.
     */
    readonly startLine: number;
    /**
     * 1-indexed line of the end marker.
     */
    readonly endLine: number;
}

export interface ScannedSection extends ManualSection {
    /**
     * Offsets into the scanned text, `body === text.slice(bodyStart, bodyEnd)`.
     */
    readonly bodyStart: number;
    readonly bodyEnd: number;
}

// Preceded by whitespace (or the line start) so e.g. `foo@manual-start` in a URL is not a marker.
const markerPattern = /(?:^|\s)@manual-(?<kind>start|end)\b(?:\s+(?<id>\S+))?/u;
const idPattern = /^[\w.-]+$/u;

export const isValidSectionId = (id: string): boolean => idPattern.test(id);

/**
 * Find all manual sections in a text. Markers own their whole line, so the comment syntax
 * around them doesn't matter.
 *
 * @param text - file content
 * @returns sections, in file order
 * @throws {GeneratedSignatureMalformedError} if markers are unbalanced, nested or duplicated
 */
export const scanSections = (text: string): ScannedSection[] => {
    const sections: ScannedSection[] = [];
    const seen = new Set<string>();
    let open: { id: string; line: number; bodyStart: number } | null = null;

    let lineStart = 0;
    let lineNumber = 0;
    while (lineStart < text.length) {
        lineNumber++;
        const newline = text.indexOf('\n', lineStart);
        const lineEnd = newline === -1 ? text.length : newline + 1;
        const match = markerPattern.exec(text.slice(lineStart, lineEnd));

        if (match) {
            const { kind, id = '' } = match.groups!;
            if (!isValidSectionId(id)) {
                throw new GeneratedSignatureMalformedError({
                    reason: 'invalid-section-id',
                    line: lineNumber,
                    detail: `"${id}" must match ${idPattern}`,
                });
            }
            if (kind === 'start') {
                if (open) {
                    throw new GeneratedSignatureMalformedError({
                        reason: 'nested-section',
                        line: lineNumber,
                        detail: `"${id}" starts inside "${open.id}"`,
                    });
                }
                if (seen.has(id)) {
                    throw new GeneratedSignatureMalformedError({
                        reason: 'duplicate-section',
                        line: lineNumber,
                        detail: `"${id}" is already defined`,
                    });
                }
                open = { id, line: lineNumber, bodyStart: lineEnd };
            } else {
                if (open?.id !== id) {
                    throw new GeneratedSignatureMalformedError({
                        reason: 'unopened-section',
                        line: lineNumber,
                        detail: open
                            ? `"${id}" ends while "${open.id}" is open`
                            : `"${id}" ends without a start`,
                    });
                }
                sections.push({
                    id,
                    body: text.slice(open.bodyStart, lineStart),
                    startLine: open.line,
                    endLine: lineNumber,
                    bodyStart: open.bodyStart,
                    bodyEnd: lineStart,
                });
                seen.add(id);
                open = null;
            }
        }

        lineStart = lineEnd;
    }

    if (open) {
        throw new GeneratedSignatureMalformedError({
            reason: 'unclosed-section',
            line: open.line,
            detail: `"${open.id}" has no end`,
        });
    }

    return sections;
};

/**
 * Replace the body of each section, working backwards so earlier offsets stay valid.
 *
 * @param text - text the sections were scanned from
 * @param sections - scanned sections of `text`
 * @param getBody - new body for a section
 * @returns text with bodies replaced
 */
export const replaceBodies = (
    text: string,
    sections: readonly ScannedSection[],
    getBody: (section: ScannedSection) => string
): string => {
    let result = text;
    for (const section of sections.toReversed()) {
        result =
            result.slice(0, section.bodyStart) + getBody(section) + result.slice(section.bodyEnd);
    }
    return result;
};

import type { CommentOptions } from './comment-style.js';
import type { ManualSection } from './sections.js';
import { renderComment, resolveCommentStyle } from './comment-style.js';
import { GeneratedSignatureSectionIdError } from './errors.js';
import { isValidSectionId, replaceBodies, scanSections } from './sections.js';

/**
 * @import { GeneratedSignatureMalformedError } from './errors.js'
 */

/**
 * Find the manual sections in a file.
 *
 * @param text - file content
 * @returns sections by id, in file order
 * @throws {GeneratedSignatureMalformedError} if markers are unbalanced, nested or duplicated
 */
export const parseSections = (text: string): ReadonlyMap<string, ManualSection> =>
    new Map(
        scanSections(text).map(({ id, body, startLine, endLine }) => [
            id,
            { id, body, startLine, endLine },
        ])
    );

export interface MergeResult {
    /**
     * Generated text, with each section body taken from the existing file when it has a section
     * with the same id.
     */
    readonly text: string;
    /**
     * Ids of sections in the existing file that the generated text no longer has, and whose
     * body isn't blank. Dropping them would lose someone's edits.
     */
    readonly orphans: readonly string[];
}

/**
 * Carry manual edits from an existing file over into freshly generated text.
 *
 * Sections are matched by id, not position, so the generator can add, remove or reorder them.
 *
 * @param params - texts to merge
 * @param params.generated - new generator output, with default section bodies
 * @param params.existing - current file content
 * @returns merged text and orphaned section ids
 * @throws {GeneratedSignatureMalformedError} if either text's sections are malformed
 */
export const mergeSections = ({
    generated,
    existing,
}: {
    generated: string;
    existing: string;
}): MergeResult => {
    const existingSections = parseSections(existing);
    const generatedSections = scanSections(generated);
    const generatedIds = new Set(generatedSections.map(({ id }) => id));

    return {
        text: replaceBodies(
            generated,
            generatedSections,
            section => existingSections.get(section.id)?.body ?? section.body
        ),
        orphans: existingSections
            .values()
            .filter(({ id, body }) => !generatedIds.has(id) && body.trim() !== '')
            .map(({ id }) => id)
            .toArray(),
    };
};

export type ManualSectionOptions = CommentOptions & {
    readonly id: string;
    /**
     * Default content, used until someone edits it.
     */
    readonly body?: string;
    /**
     * Prefixed to the markers and each non-blank body line.
     */
    readonly indent?: string;
};

/**
 * Render a manual section, for a generator to embed in its output.
 *
 * @param options - section id, default body, and comment syntax
 * @returns marker lines around the body, without a trailing line break
 * @throws {GeneratedSignatureSectionIdError} if the id is not valid
 */
export const manualSection = ({
    id,
    body = '',
    indent = '',
    ...options
}: ManualSectionOptions): string => {
    if (!isValidSectionId(id)) {
        throw new GeneratedSignatureSectionIdError(id);
    }
    const style = resolveCommentStyle(options);
    const lines = body === '' ? [] : body.replace(/\n$/v, '').split('\n');
    return [
        renderComment(style, `@manual-start ${id}`),
        ...lines,
        renderComment(style, `@manual-end ${id}`),
    ]
        .map(line => (line.trim() === '' ? line : indent + line))
        .join('\n');
};

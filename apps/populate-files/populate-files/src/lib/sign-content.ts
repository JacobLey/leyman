import type { VerifyResult } from 'generated-signature';
import { mergeSections, parseSections, sign, verify } from 'generated-signature';
import { PopulateFilesOwnershipError } from './lib/errors.js';

const hasValidSections = (text: string): boolean => {
    try {
        parseSections(text);
        return true;
    } catch {
        return false;
    }
};

const assertOwned = (filePath: string, result: VerifyResult): void => {
    if (result.status === 'valid') {
        return;
    }
    if (result.status === 'malformed') {
        throw new PopulateFilesOwnershipError({
            filePath,
            reason: 'malformed',
            detail: result.error.message,
            cause: result.error,
        });
    }
    throw new PopulateFilesOwnershipError(
        result.status === 'invalid'
            ? { filePath, reason: 'edited', detail: 'outside of manual sections' }
            : { filePath, reason: 'not-owned' }
    );
};

/**
 * Sign generated content, keeping the manual sections of the file it replaces.
 *
 * Refuses (unless forced) to replace a file that was not signed, or was edited outside of its
 * manual sections, since either could mean overwriting someone's work.
 *
 * @param params - generated and existing content
 * @param params.filePath - path of the file, for its comment syntax and errors
 * @param params.generated - generator output
 * @param params.existing - current file content, or `null` if there is none
 * @param params.force - overwrite files that are not ours, and drop orphaned sections
 * @returns signed content to write
 * @throws {PopulateFilesOwnershipError} if the existing file may not be overwritten
 */
export const signContent = ({
    filePath,
    generated,
    existing,
    force,
}: {
    filePath: string;
    generated: string;
    existing: string | null;
    force: boolean;
}): string => {
    if (existing === null) {
        return sign(generated, { filePath });
    }

    if (!force) {
        assertOwned(filePath, verify(existing));
    }

    // When forced, an existing file whose markers can't be read has no edits worth keeping.
    const { text, orphans } =
        force && !hasValidSections(existing)
            ? { text: generated, orphans: [] }
            : mergeSections({ generated, existing });

    if (!force && orphans.length > 0) {
        throw new PopulateFilesOwnershipError({
            filePath,
            reason: 'orphaned-section',
            detail: orphans.join(', '),
        });
    }

    return sign(text, { filePath });
};

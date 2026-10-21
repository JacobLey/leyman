import type { OwnershipReason, PopulationResponseUpdateReason } from './types.js';

export const formatErrorMessage = ({
    filePath,
    reason,
}: {
    filePath: string;
    reason: PopulationResponseUpdateReason;
}): string => `File ${filePath} not up to date. Reason: ${reason}`;

const ownershipMessages = {
    edited: 'was edited since it was generated',
    malformed: 'has a malformed signature or manual sections',
    'not-owned': 'exists but is not signed, so it may not be generated',
    'orphaned-section': 'has manual sections with content that would be removed',
} as const satisfies Record<OwnershipReason, string>;

/**
 * Base class of errors thrown by this package.
 *
 * All instances of this error will be of a subclass with a more specific failure reason.
 */
export abstract class PopulateFilesError extends Error {}

/**
 * A signed file can't be overwritten without losing someone's edits.
 */
export class PopulateFilesOwnershipError extends PopulateFilesError {
    public readonly filePath: string;
    public readonly reason: OwnershipReason;

    public constructor({
        filePath,
        reason,
        detail,
        cause,
    }: {
        filePath: string;
        reason: OwnershipReason;
        detail?: string;
        cause?: unknown;
    }) {
        const suffix = detail ? ` (${detail})` : '';
        super(
            `File ${filePath} ${ownershipMessages[reason]}${suffix}. Pass \`force\` to overwrite it.`,
            {
                cause,
            }
        );
        this.name = 'PopulateFilesOwnershipError';
        this.filePath = filePath;
        this.reason = reason;
    }
}

import type { OwnershipReason, PopulationResponseUpdateReason } from './types.js';

interface OutdatedFile {
    readonly filePath: string;
    readonly reason: PopulationResponseUpdateReason;
}

const formatErrorMessage = ({ filePath, reason }: OutdatedFile): string =>
    `File ${filePath} not up to date. Reason: ${reason}`;

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
        const suffix = detail === undefined ? '' : ` (${detail})`;
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

/**
 * With `check`, files are out of date: they would be created, changed or (with `clean`) removed.
 */
export class PopulateFilesCheckError extends PopulateFilesError {
    public readonly files: readonly OutdatedFile[];

    /**
     * @param files - every file that is out of date, and why
     */
    public constructor(files: readonly OutdatedFile[]) {
        super(files.map(file => formatErrorMessage(file)).join(', '));
        this.name = 'PopulateFilesCheckError';
        this.files = files;
    }
}

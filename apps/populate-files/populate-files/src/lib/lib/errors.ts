import type { PopulationResponseUpdateReason } from './types.js';

export const formatErrorMessage = ({
    filePath,
    reason,
}: {
    filePath: string;
    reason: PopulationResponseUpdateReason;
}): string => `File ${filePath} not up to date. Reason: ${reason}`;

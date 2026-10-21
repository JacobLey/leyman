import type { PopulateFileParams } from 'populate-files';
import { defaultImport } from 'default-import';
import { hasCode } from 'unknown-error';
import { populateFileParamsValidator } from './lib/populate-files-validator.js';

type Issue = NonNullable<ReturnType<typeof populateFileParamsValidator.validate>['issues']>[number];

/**
 * One line of the error message, e.g. `- filePath: must be string`.
 *
 * @param issue - validation issue
 * @returns issue at its path
 */
const formatIssue = ({ path, message }: Issue): string => {
    // Always set by juniper-validator, as keys
    const at = (path as readonly PropertyKey[]).map(String).join('.');
    return at ? `- ${at}: ${message}` : `- ${message}`;
};

/**
 * Dynamically import a JS file and validate its default export as populate-files input.
 *
 * @param filePath - absolute path to JS file
 * @returns list of populate-files params exported by the file
 */
export const loadFile = async (filePath: string): Promise<PopulateFileParams[]> => {
    let mod: unknown;
    try {
        mod = await import(filePath);
    } catch (err) {
        if (hasCode(err, 'ERR_MODULE_NOT_FOUND')) {
            throw new Error(`JS file not found: ${filePath}`, { cause: err });
        }
        throw err;
    }
    const params = defaultImport(mod);

    const result = populateFileParamsValidator.validate(params);
    if (!result.issues) {
        return [result.value].flat();
    }

    throw new Error(
        [
            `File content does not fulfill populate-file input at: ${filePath}`,
            ...result.issues.map(issue => formatIssue(issue)),
        ].join('\n')
    );
};

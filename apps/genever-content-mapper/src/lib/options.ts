import type { GeneverOptions } from 'genever';

/**
 * Options of the mapper's `contentMappers` entry in `tsconfig.json`: the subset of genever's options that
 * apply to one document. Every mapped file of the project shares them.
 */
export type MapperOptions = Pick<
    GeneverOptions,
    'name' | 'openApi30' | 'parameterDefaults' | 'strict' | 'typedMinItems'
>;

/**
 * A problem with one option, reported by TypeScript at that option in `tsconfig.json`.
 */
export interface OptionDiagnostic {
    /**
     * Path to the option, inside the entry's `options` object.
     */
    readonly path: readonly (number | string)[];
    readonly messageText: string;
    readonly code: number;
}

/**
 * Diagnostic code of an invalid option.
 */
export const invalidOptionCode = 1;

const booleanOptions = ['openApi30', 'parameterDefaults', 'strict'] as const;

/**
 * Read the options of a `contentMappers` entry.
 *
 * @param options - the entry's `options`, as TypeScript sent them
 * @returns options for genever, from every valid option, and a diagnostic for each invalid one
 */
export const parseOptions = (
    options: unknown
): { options: MapperOptions; diagnostics: OptionDiagnostic[] } => {
    const diagnostics: OptionDiagnostic[] = [];
    const parsed: { -readonly [K in keyof MapperOptions]: MapperOptions[K] } = {};
    if (options === undefined || options === null) {
        return { options: parsed, diagnostics };
    }
    if (typeof options !== 'object' || Array.isArray(options)) {
        diagnostics.push({
            path: [],
            messageText: 'genever-content-mapper options must be an object.',
            code: invalidOptionCode,
        });
        return { options: parsed, diagnostics };
    }
    for (const [key, value] of Object.entries(options)) {
        const invalid = (expected: string): void => {
            diagnostics.push({
                path: [key],
                messageText: `Option '${key}' must be ${expected}.`,
                code: invalidOptionCode,
            });
        };
        if ((booleanOptions as readonly string[]).includes(key)) {
            if (typeof value === 'boolean') {
                parsed[key as (typeof booleanOptions)[number]] = value;
            } else {
                invalid('a boolean');
            }
        } else if (key === 'name') {
            if (typeof value === 'string' && value !== '') {
                parsed.name = value;
            } else {
                invalid('a non-empty string');
            }
        } else if (key === 'typedMinItems') {
            if (Number.isSafeInteger(value) && (value as number) >= 0) {
                parsed.typedMinItems = value as number;
            } else {
                invalid('a non-negative integer');
            }
        } else {
            diagnostics.push({
                path: [key],
                messageText: `Unknown option '${key}'.`,
                code: invalidOptionCode,
            });
        }
    }
    return { options: parsed, diagnostics };
};

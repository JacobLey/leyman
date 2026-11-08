import { IdempotencyKeysOptionError } from './errors.js';

/**
 * Quotes a Postgres identifier (a table or channel name), so any name works as given, case included.
 *
 * @param option - Name of the option, for the error
 * @param name - Name as given
 * @returns Quoted identifier
 * @throws {IdempotencyKeysOptionError} When empty
 */
export const quoteIdentifier = (option: string, name: string): string => {
    if (name.length === 0) {
        throw new IdempotencyKeysOptionError(option, name, 'must not be empty');
    }
    return `"${name.replaceAll('"', '""')}"`;
};

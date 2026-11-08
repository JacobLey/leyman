import { IdempotencyKeysOptionError } from './errors.js';

/**
 * Postgres's `NAMEDATALEN` less one.
 */
const maxIdentifierBytes = 63;
const encoder = new TextEncoder();

/**
 * Quotes a Postgres identifier (a table or channel name), so any name works as given, case included. A name is one
 * identifier, never schema-qualified: a table in another schema is found through the client's `search_path`.
 *
 * @param option - Name of the option, for the error
 * @param name - Name as given
 * @returns Quoted identifier
 * @throws {IdempotencyKeysOptionError} When empty, or longer than Postgres's 63 bytes
 */
export const quoteIdentifier = (option: string, name: string): string => {
    if (name.length === 0) {
        throw new IdempotencyKeysOptionError(option, name, 'must not be empty');
    }
    // Postgres would cut a longer name down to 63 bytes, silently naming another table or channel
    if (encoder.encode(name).byteLength > maxIdentifierBytes) {
        throw new IdempotencyKeysOptionError(
            option,
            name,
            `must be at most ${maxIdentifierBytes} bytes`
        );
    }
    return `"${name.replaceAll('"', '""')}"`;
};

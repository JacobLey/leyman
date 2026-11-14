/**
 * The formatter failed on the input, such as on a syntax error or an invalid config. Files it didn't fail on may
 * already be formatted. Ignored and unsupported files, and a missing formatter, are not failures: they are left
 * unchanged.
 */
export class FormatFileError extends Error {
    /**
     * Formatter that failed.
     */
    public readonly formatter: 'biome' | 'prettier';
    public constructor(formatter: 'biome' | 'prettier', options: { readonly cause: unknown }) {
        super(`${formatter === 'biome' ? 'Biome' : 'Prettier'} failed to format`, options);
        this.name = 'FormatFileError';
        this.formatter = formatter;
    }
}

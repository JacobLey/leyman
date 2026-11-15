/**
 * The message of the line AWS Emulator logs once it serves requests, since 1.0.290. Its other fields are documented
 * in the CLI reference: https://docs.aws.amazon.com/emulator/latest/userguide/cli-reference.html
 */
const startupMessage = 'emulator server information';

/**
 * What the startup line gives.
 */
export interface StartupLine {
    readonly endpoint: string;
    readonly configFile: string;
    readonly caFile: string;
}

/**
 * Reads one line of the emulator's output. It logs JSON lines, whose fields are under `fields`, and a few lines of
 * plain text, which are ignored like every other line.
 *
 * @param line - One line of its standard output
 * @returns The startup line's fields, or `null` for any other line
 */
export const parseStartupLine = (line: string): StartupLine | null => {
    let entry: unknown;
    try {
        entry = JSON.parse(line);
    } catch {
        return null;
    }
    const fields = (entry as { readonly fields?: Readonly<Record<string, unknown>> } | null)
        ?.fields;
    if (fields?.message !== startupMessage) {
        return null;
    }
    const { endpoint_url: endpoint, config_file: configFile, ca_file: caFile } = fields;
    if (
        typeof endpoint !== 'string' ||
        typeof configFile !== 'string' ||
        typeof caFile !== 'string'
    ) {
        return null;
    }
    return { endpoint, configFile, caFile };
};

/**
 * Reads the `key = value` lines of an AWS config or credentials file, as the emulator writes them: one profile,
 * `[default]`. Indented lines continue a nested value (such as `s3 =`), so they are skipped, and the first value of a
 * key wins.
 *
 * @param text - The file's text
 * @returns Its values by key
 */
export const parseIni = (text: string): ReadonlyMap<string, string> => {
    const values = new Map<string, string>();
    for (const line of text.split('\n')) {
        const equals = line.indexOf('=');
        if (equals <= 0 || /^\s/v.test(line)) {
            continue;
        }
        const key = line.slice(0, equals).trim();
        if (!values.has(key)) {
            values.set(key, line.slice(equals + 1).trim());
        }
    }
    return values;
};

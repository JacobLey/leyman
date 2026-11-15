import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * A directory of fake emulators and the files they name, removed once the tests are done.
 */
export interface FakeEmulators {
    readonly dir: string;
    /**
     * Writes a fake emulator: a shell script, which gets the arguments the real one would.
     *
     * @param name - Its file name
     * @param body - Its commands
     * @returns Its path
     */
    readonly write: (name: string, body: string) => Promise<string>;
    /**
     * Writes the files a real emulator would (config, keys and certificate authority) in a directory of their own (`<name>-files`).
     *
     * @param name - The directory's name
     * @param files - The text of each file, by name, in place of the usual one
     * @returns The startup line naming them
     */
    readonly writeFiles: (
        name: string,
        files?: Readonly<Record<string, string>>
    ) => Promise<string>;
    readonly remove: () => Promise<void>;
}

export const config = [
    '[default]',
    'region = eu-west-3',
    'endpoint_url = https://127.0.0.1:1234',
    's3 =',
    '  region = nested',
    'region = later',
    '',
].join('\n');
export const credentials = [
    '[default]',
    'aws_access_key_id = EMULATORKEY',
    'aws_secret_access_key = EMULATORSECRET',
    '',
].join('\n');
export const ca = '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----\n';

/**
 * The line a real emulator logs once it serves requests.
 *
 * @param dir - The directory of the files it names
 * @returns The JSON line
 */
export const startupLine = (dir: string): string =>
    JSON.stringify({
        timestamp: '2026-11-15T00:00:00.000000Z',
        level: 'INFO',
        fields: {
            message: 'emulator server information',
            endpoint_url: 'https://127.0.0.1:1234',
            health_check_url: 'https://127.0.0.1:1234/__admin/health',
            config_file: path.join(dir, 'config'),
            ca_file: path.join(dir, 'ca.pem'),
            java_truststore_file: path.join(dir, 'truststore.p12'),
        },
        target: 'aws_emulator_server',
    });

/**
 * Quotes text for a shell script.
 *
 * @param text - Any text
 * @returns The text in single quotes
 */
export const shellQuote = (text: string): string => {
    const escaped = text.replaceAll("'", String.raw`'\''`);
    return `'${escaped}'`;
};

/**
 * Makes a directory for fake emulators.
 *
 * @returns The directory, and how to write into it
 */
export const fakeEmulators = async (): Promise<FakeEmulators> => {
    const dir = await mkdtemp(path.join(tmpdir(), 'aws-emulator-launch-'));
    return {
        dir,
        write: async (name, body) => {
            const file = path.join(dir, name);
            await writeFile(file, `#!/bin/sh\n${body}\n`);
            await chmod(file, 0o755);
            return file;
        },
        writeFiles: async (name, files = {}) => {
            const filesDir = path.join(dir, `${name}-files`);
            await mkdir(filesDir);
            const contents = { config, emulator_credentials: credentials, 'ca.pem': ca, ...files };
            await Promise.all(
                Object.entries(contents).map(async ([file, text]) =>
                    writeFile(path.join(filesDir, file), text)
                )
            );
            return startupLine(filesDir);
        },
        remove: async () => {
            await rm(dir, { recursive: true, force: true });
        },
    };
};

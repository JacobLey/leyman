import type { StartupLine } from '#internal/lib/startup.js';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
    AwsEmulatorExitError,
    AwsEmulatorFileError,
    AwsEmulatorNotRunError,
    AwsEmulatorStartTimeoutError,
} from '#internal/lib/errors.js';
import { parseIni, parseStartupLine } from '#internal/lib/startup.js';

export type { AwsClientConfig, AwsEmulatorConnection } from '#internal/lib/client-config.js';
export { awsClientConfig } from '#internal/lib/client-config.js';
export {
    AwsEmulatorError,
    AwsEmulatorExitError,
    AwsEmulatorFileError,
    AwsEmulatorNotRunError,
    AwsEmulatorStartTimeoutError,
} from '#internal/lib/errors.js';

/**
 * How to start the emulator. Every option has a default.
 */
export interface LaunchAwsEmulatorOptions {
    /**
     * The emulator's executable, a path or a name looked up on `PATH`.
     *
     * @default 'aws-emulator'
     */
    readonly binary?: string;
    /**
     * Milliseconds without an API call after which the emulator exits on its own (`--idle-timeout`, rounded up to
     * whole seconds), so one whose process died before calling `stop()` doesn't run forever.
     *
     * @default 600000
     */
    readonly idleTimeoutMs?: number;
    /**
     * Milliseconds to wait for the startup line, after which the emulator is killed.
     *
     * @default 10000
     */
    readonly startTimeoutMs?: number;
}

/**
 * A running emulator, and what a client needs to reach it.
 */
export interface AwsEmulator {
    /**
     * Where it serves every AWS API, such as `https://127.0.0.1:43085`.
     */
    readonly endpoint: string;
    /**
     * The region of its config file.
     */
    readonly region: string;
    /**
     * This run's keys, which requests are signed with, since authentication is on.
     */
    readonly credentials: {
        readonly accessKeyId: string;
        readonly secretAccessKey: string;
    };
    /**
     * Its certificate authority, as PEM, for a client to trust. `awsClientConfig()` passes it to an AWS SDK client.
     */
    readonly ca: string;
    /**
     * The path of the same certificate authority, for a client that only takes a file. It is deleted when the
     * emulator stops.
     */
    readonly caFile: string;
    /**
     * Stops the emulator (`SIGTERM`), which deletes its files, and resolves once it has exited. Calling it again, or
     * after the emulator exited on its own, just waits for that exit.
     */
    readonly stop: () => Promise<void>;
    /**
     * The same as `stop()`, for `await using`.
     */
    readonly [Symbol.asyncDispose]: () => Promise<void>;
}

const defaultBinary = 'aws-emulator';
const defaultIdleTimeoutMs = 600_000;
const msPerSecond = 1000;
const defaultStartTimeoutMs = 10_000;

/**
 * Reads a file the startup line named.
 *
 * @param file - The file's path
 * @returns The file's text
 * @rejects {AwsEmulatorFileError} When it can't be read
 */
const readNamedFile = async (file: string): Promise<string> => {
    try {
        return await readFile(file, 'utf8');
    } catch (error) {
        throw new AwsEmulatorFileError(file, 'it could not be read', { cause: error });
    }
};

/**
 * Reads one value of an AWS config or credentials file.
 *
 * @param file - Where it was read from, for an error
 * @param text - What it holds
 * @param key - Which value
 * @returns What the file holds under the key
 * @throws {AwsEmulatorFileError} When the file doesn't hold it
 */
const iniValue = (file: string, text: string, key: string): string => {
    const value = parseIni(text).get(key) ?? '';
    if (value === '') {
        throw new AwsEmulatorFileError(file, `it has no ${key}`);
    }
    return value;
};

/**
 * Starts AWS Emulator on a free port of 127.0.0.1, with authentication on and telemetry off, and waits until it
 * serves requests.
 *
 * @param options - How to start it
 * @returns Where it serves, its region, keys and certificate authority, and how to stop it
 * @rejects {AwsEmulatorNotRunError} When the binary can't be run
 * @rejects {AwsEmulatorExitError} When the emulator exits before it starts
 * @rejects {AwsEmulatorStartTimeoutError} When it doesn't start within `startTimeoutMs`
 * @rejects {AwsEmulatorFileError} When a file its startup line names can't be read
 */
export const launchAwsEmulator = async (
    options: LaunchAwsEmulatorOptions = {}
): Promise<AwsEmulator> => {
    const {
        binary = defaultBinary,
        idleTimeoutMs = defaultIdleTimeoutMs,
        startTimeoutMs = defaultStartTimeoutMs,
    } = options;
    const child = spawn(
        binary,
        [
            // Only the address its certificate covers, whatever EMULATOR_BIND_ADDRESS says
            '-b',
            '127.0.0.1',
            '-p',
            '0',
            '-a',
            'on',
            // Whole seconds, rounded up
            '--idle-timeout',
            String(Math.ceil(idleTimeoutMs / msPerSecond)),
            // Off always wins over EMULATOR_TELEMETRY and the config file, while on can't override them (`aws-emulator --help`)
            '-t',
            'off',
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    const closed = new Promise<void>(resolve => {
        child.once('close', () => {
            resolve();
        });
    });
    const stop = async (): Promise<void> => {
        // Does nothing once it has exited
        child.kill('SIGTERM');
        await closed;
    };

    // Output is kept until it starts, for an error to show
    let output = '';
    let partialLine = '';
    let hasTimedOut = false;
    const keepOutput = (chunk: string): void => {
        output += chunk;
    };
    const startup = new Promise<StartupLine>((resolve, reject) => {
        child.on('error', error => {
            reject(new AwsEmulatorNotRunError(binary, error));
        });
        child.stdout.on('data', (chunk: string) => {
            const lines = (partialLine + chunk).split('\n');
            partialLine = lines.pop()!;
            const parsed = lines.map(line => parseStartupLine(line)).find(line => line !== null);
            // A line read once it was being killed doesn't count
            if (parsed && !hasTimedOut) {
                resolve(parsed);
            }
        });
        // Rejecting does nothing once it has started
        child.once('close', (code, signal) => {
            reject(
                hasTimedOut
                    ? new AwsEmulatorStartTimeoutError(startTimeoutMs, output)
                    : new AwsEmulatorExitError(code, signal, output)
            );
        });
    });
    child.stdout.on('data', keepOutput);
    child.stderr.on('data', keepOutput);
    const timer = setTimeout(() => {
        hasTimedOut = true;
        // It may be stuck, so it isn't asked to stop. The error is thrown once it has exited
        child.kill('SIGKILL');
    }, startTimeoutMs);

    let startupLine: StartupLine;
    try {
        startupLine = await startup;
    } finally {
        clearTimeout(timer);
        // Its output is still read, so it never blocks on a full pipe, but no longer kept
        child.stdout.removeAllListeners('data').resume();
        child.stderr.removeAllListeners('data').resume();
    }

    try {
        // Its keys are written beside its config
        const credentialsFile = path.join(
            path.dirname(startupLine.configFile),
            'emulator_credentials'
        );
        const [ca, config, credentials] = await Promise.all([
            readNamedFile(startupLine.caFile),
            readNamedFile(startupLine.configFile),
            readNamedFile(credentialsFile),
        ]);
        return {
            endpoint: startupLine.endpoint,
            region: iniValue(startupLine.configFile, config, 'region'),
            credentials: {
                accessKeyId: iniValue(credentialsFile, credentials, 'aws_access_key_id'),
                secretAccessKey: iniValue(credentialsFile, credentials, 'aws_secret_access_key'),
            },
            caFile: startupLine.caFile,
            [Symbol.asyncDispose]: stop,
            ca,
            stop,
        };
    } catch (error) {
        await stop();
        throw error;
    }
};

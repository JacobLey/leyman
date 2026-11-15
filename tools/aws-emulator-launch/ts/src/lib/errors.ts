import type { ChildProcess } from 'node:child_process';

/**
 * Where to install AWS Emulator, for an error that can't find it or finds one too old.
 */
const installPage = 'https://docs.aws.amazon.com/emulator/latest/userguide/getting-started.html';

/**
 * Base of every error `aws-emulator-launch` throws.
 */
export abstract class AwsEmulatorError extends Error {}

/**
 * The binary couldn't be run: most often it isn't installed, or isn't on `PATH`.
 */
export class AwsEmulatorNotRunError extends AwsEmulatorError {
    public readonly binary: string;
    public constructor(binary: string, cause: unknown) {
        super(
            `Could not run ${binary}. Install AWS Emulator (${installPage}), or pass its path as \`binary\``,
            {
                cause,
            }
        );
        this.name = 'AwsEmulatorNotRunError';
        this.binary = binary;
    }
}

/**
 * The emulator exited before it printed its startup line, for instance on an option it doesn't know.
 */
export class AwsEmulatorExitError extends AwsEmulatorError {
    public readonly code: number | null;
    public readonly signal: ChildProcess['signalCode'];
    public readonly output: string;
    public constructor(code: number | null, signal: ChildProcess['signalCode'], output: string) {
        const ended =
            code === null ? `was stopped by ${String(signal)}` : `exited with code ${code}`;
        super(`AWS Emulator ${ended} before it started. Its output:\n${output}`);
        this.name = 'AwsEmulatorExitError';
        this.code = code;
        this.signal = signal;
        this.output = output;
    }
}

/**
 * The emulator didn't print its startup line in time, so it was killed. Releases before 1.0.290 print a different
 * line, so they always end here.
 */
export class AwsEmulatorStartTimeoutError extends AwsEmulatorError {
    public readonly timeoutMs: number;
    public readonly output: string;
    public constructor(timeoutMs: number, output: string) {
        super(
            `AWS Emulator didn't print its startup line within ${timeoutMs} ms, so it was killed. It needs version 1.0.290 or later (${installPage}). Its output:\n${output}`
        );
        this.name = 'AwsEmulatorStartTimeoutError';
        this.timeoutMs = timeoutMs;
        this.output = output;
    }
}

/**
 * A file the startup line named couldn't be read, or lacks what it should hold (the region, the keys, a certificate),
 * so the emulator was stopped.
 */
export class AwsEmulatorFileError extends AwsEmulatorError {
    public readonly file: string;
    public constructor(file: string, reason: string, options?: ErrorOptions) {
        super(`Could not read AWS Emulator's ${file}: ${reason}`, options);
        this.name = 'AwsEmulatorFileError';
        this.file = file;
    }
}

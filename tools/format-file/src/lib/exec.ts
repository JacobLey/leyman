import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const execFileAsync = promisify(execFile);

/**
 * Run a formatter on `input` passed through stdin.
 *
 * @param command - formatter executable
 * @param args - formatter arguments
 * @param input - text to format
 * @returns formatted text, printed to stdout
 */
export const execWithInput = async (
    command: string,
    args: string[],
    input: string
): Promise<string> => {
    // Formatted output is as large as the input, which may be larger than the default buffer
    const output = execFileAsync(command, args, { maxBuffer: Number.POSITIVE_INFINITY });
    output.child.stdin!.end(input);
    const { stdout } = await output;
    return stdout;
};

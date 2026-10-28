import { spawn } from 'node:child_process';
import { once } from 'node:events';
import Path from 'node:path';
import { planTsc } from './plan.js';
import { findTsc } from './tsc.js';

/**
 * Run `trusted-tsc`: `tsc` with the given arguments, and only trusted content mappers, sandboxed. With `--check`,
 * check the mappers without running `tsc`.
 *
 * @param argv - command line arguments
 * @param cwd - working directory
 * @param env - environment
 * @returns exit code
 */
export const main = async (
    argv: readonly string[],
    cwd: string,
    env: Readonly<Record<string, string | undefined>>
): Promise<number> => {
    const isCheck = argv.includes('--check');
    try {
        const plan = await planTsc(
            argv.filter(arg => arg !== '--check'),
            cwd,
            env
        );
        if (isCheck) {
            for (const { name, version } of plan.mappers) {
                // eslint-disable-next-line no-console -- The command's output
                console.log(`${name}@${version}: trusted, sandboxed`);
            }
            // eslint-disable-next-line no-console -- The command's output
            console.log(`${plan.mappers.length} content mappers in ${plan.configFile}`);
            return 0;
        }
        const tsc = await findTsc(Path.dirname(plan.configFile));
        const child = spawn(tsc, plan.args, { cwd, env: plan.env, stdio: 'inherit' });
        const [code, signal] = (await once(child, 'exit')) as [null, string] | [number, null];
        // A signal that killed tsc is a failure
        return signal === null ? code : 1;
    } catch (error) {
        // eslint-disable-next-line no-console -- The command's output
        console.error(`trusted-tsc: ${(error as Error).message}`);
        return 1;
    }
};

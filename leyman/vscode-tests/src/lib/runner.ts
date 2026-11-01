import type { Project } from './project.js';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { compiledSpec } from './project.js';

export interface Selection {
    readonly kind: 'suite' | 'test';
    /**
     * Title of each enclosing suite, then its own.
     */
    readonly titles: readonly string[];
}

export interface RunCommand {
    readonly program: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly report: string;
}

export interface Failure {
    readonly message: string;
    readonly stack?: string;
    readonly expected?: unknown;
    readonly actual?: unknown;
}

export interface Outcome {
    readonly fullTitle: string;
    readonly state: 'failed' | 'passed' | 'skipped';
    readonly duration?: number | undefined;
    readonly failure?: Failure;
}

export interface Report {
    readonly outcomes: readonly Outcome[];
    /**
     * A failure no test owns, such as a spec that fails to load.
     */
    readonly failure?: string;
}

const escapeRegExp = (text: string): string =>
    text.replaceAll(/[$\(\)*+.?\[\\\]^\{\|\}]/gv, String.raw`\$&`);

/**
 * What a runner matches its pattern against has this between titles. Its reports use a space either way.
 */
const TITLE_SEPARATORS: Readonly<Record<Project['runner'], string>> = {
    mocha: ' ',
    vitest: ' > ',
};

/**
 * Selects by whole title, so a test doesn't also run those it is a prefix of.
 *
 * @param runner - runner that matches the pattern
 * @param selections - what to run
 * @returns regular expression source
 */
export const titlePattern = (
    runner: Project['runner'],
    selections: readonly Selection[]
): string => {
    const separator = TITLE_SEPARATORS[runner];
    return `^(?:${selections
        .map(({ titles, kind }) => {
            const title = escapeRegExp(titles.join(separator));
            return `${title}${kind === 'suite' ? separator : '$'}`;
        })
        .join('|')})`;
};

/**
 * The runner's command for a spec, in the shape of the project's test targets, minus coverage.
 *
 * @param options - what to run
 * @param options.workspace - root of the workspace
 * @param options.project - project of the spec
 * @param options.spec - path of the spec's source
 * @param options.selections - parts of the spec to run, or all of it if empty
 * @param options.report - path to write results to
 * @param options.isDebug - run for a debugger, which pauses longer than any timeout
 * @returns program, its arguments and where it reports
 */
export const buildCommand = ({
    workspace,
    project,
    spec,
    selections,
    report,
    isDebug,
}: {
    workspace: string;
    project: Project;
    spec: string;
    selections: readonly Selection[];
    report: string;
    isDebug: boolean;
}): RunCommand => {
    const compiled = compiledSpec(project, spec);
    const patternArgs = (flag: string): string[] =>
        selections.length > 0 ? [flag, titlePattern(project.runner, selections)] : [];
    const { root: cwd } = project;

    if (project.runner === 'vitest') {
        return {
            program: Path.join(cwd, 'node_modules', 'vitest', 'vitest.mjs'),
            args: [
                'run',
                '--config',
                Path.join(workspace, 'configs', 'vitest.config.js'),
                '--root',
                '.',
                '--reporter',
                'json',
                '--outputFile',
                report,
                ...patternArgs('--testNamePattern'),
                ...(isDebug ? ['--testTimeout', '0'] : []),
                compiled,
            ],
            cwd,
            report,
        };
    }

    const timeout = compiled.includes(`${Path.sep}integration${Path.sep}`) ? '10000' : '2000';
    return {
        program: Path.join(cwd, 'node_modules', 'mocha', 'bin', 'mocha.js'),
        args: [
            compiled,
            '--timeout',
            isDebug ? '0' : timeout,
            '--reporter',
            'json',
            '--reporter-option',
            `output=${report}`,
            ...patternArgs('--grep'),
        ],
        cwd,
        report,
    };
};

/**
 * Runs a process in a group of its own, and stops the whole group when aborted.
 *
 * @param options - how to run it
 * @param options.command - program, on `PATH` or by path
 * @param options.args - its arguments
 * @param options.cwd - directory to run in
 * @param options.env - its environment
 * @param options.signal - stops the process when aborted
 * @param options.onOutput - receives stdout and stderr
 * @returns exit code, or `null` if it didn't exit by itself
 */
export const runProcess = async ({
    command,
    args,
    cwd,
    env,
    signal,
    onOutput,
}: {
    command: string;
    args: readonly string[];
    cwd: string;
    env: Readonly<Record<string, string | undefined>>;
    signal: AbortSignal;
    onOutput: (text: string) => void;
}): Promise<number | null> =>
    new Promise(resolve => {
        // Its own process group: Nx and the runners have children, which would otherwise outlive it
        const child = spawn(command, args, {
            cwd,
            env,
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const stop = (): void => {
            // The group may have just exited
            void Promise.allSettled([(async () => process.kill(-child.pid!))()]);
        };
        signal.addEventListener('abort', stop);
        child.stdout.setEncoding('utf8').on('data', onOutput);
        child.stderr.setEncoding('utf8').on('data', onOutput);
        child.on('error', error => {
            onOutput(`${error.message}\n`);
        });
        child.on('close', code => {
            signal.removeEventListener('abort', stop);
            resolve(code);
        });
    });

interface MochaTest {
    fullTitle: string;
    duration?: number;
    err: Failure;
}

const fromMocha = (text: string): Report => {
    const { passes, failures, pending } = JSON.parse(text) as Record<
        'failures' | 'passes' | 'pending',
        MochaTest[]
    >;
    return {
        outcomes: [
            ...passes.map(
                ({ fullTitle, duration }): Outcome => ({ fullTitle, duration, state: 'passed' })
            ),
            ...pending.map(({ fullTitle }): Outcome => ({ fullTitle, state: 'skipped' })),
            ...failures.map(
                ({ fullTitle, duration, err }): Outcome => ({
                    fullTitle,
                    duration,
                    state: 'failed',
                    failure: err,
                })
            ),
        ],
    };
};

interface VitestResults {
    testResults: {
        message: string;
        assertionResults: {
            fullName: string;
            status: string;
            duration?: number | null;
            failureMessages: string[];
        }[];
    }[];
}

const VITEST_STATES: Readonly<Record<string, Outcome['state']>> = {
    failed: 'failed',
    passed: 'passed',
};

const fromVitest = (text: string): Report => {
    const { testResults } = JSON.parse(text) as VitestResults;
    const outcomes = testResults
        .flatMap(({ assertionResults }) => assertionResults)
        .map(({ fullName, status, duration, failureMessages }): Outcome => {
            const state = VITEST_STATES[status] ?? 'skipped';
            return {
                state,
                fullTitle: fullName,
                ...(typeof duration === 'number' && { duration }),
                ...(state === 'failed' && {
                    failure: {
                        message: failureMessages.join('\n').split('\n', 1).join(''),
                        stack: failureMessages.join('\n'),
                    },
                }),
            };
        });
    const failure = testResults.map(({ message }) => message).find(message => message !== '');
    return { outcomes, ...(failure !== undefined && { failure }) };
};

/**
 * Reads what a runner reported, in the format of either runner.
 *
 * @param project - project that ran
 * @param report - path the runner wrote its results to
 * @returns results, or a failure if the runner never got to write them
 */
export const readReport = async (project: Project, report: string): Promise<Report> => {
    try {
        const text = await readFile(report, 'utf8');
        return project.runner === 'vitest' ? fromVitest(text) : fromMocha(text);
    } catch {
        return {
            outcomes: [],
            failure: 'The test runner stopped before reporting results. See its output.',
        };
    }
};

const SPEC_FRAME =
    // eslint-disable-next-line regexp/no-super-linear-move, sonarjs/super-linear-regex, sonarjs/unused-named-groups -- Only runs on stacks of this repo's tests, read from `groups` below
    /(?:file:\/\/)?(?<path>\/[^\s\(\):]+\.spec\.[cm]?tsx?):(?<line>\d+):(?<column>\d+)/v;

/**
 * Where a failure happened in a spec, from the source-mapped stack.
 *
 * @param stack - stack of the failure, if any
 * @returns zero-based position of the first frame in a spec
 */
export const failureLocation = (
    stack = ''
): { path: string; line: number; character: number } | undefined => {
    const match = SPEC_FRAME.exec(stack);
    if (!match) {
        return undefined;
    }
    const { path, line, column } = match.groups as Record<'column' | 'line' | 'path', string>;
    return { path, line: Number(line) - 1, character: Number(column) - 1 };
};

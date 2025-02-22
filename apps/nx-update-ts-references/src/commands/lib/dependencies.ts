import { createProjectGraphAsync, type ProjectGraph } from '@nx/devkit';
import { type Directory, parseCwd } from 'npm-parse-cwd';
import { bind, createModule, identifier, singletonScope } from 'haywire';

export type ConsoleLog = (log: unknown) => void;
export const consoleLogId = identifier<ConsoleLog>().named('log');
export const consoleErrorId = identifier<ConsoleLog>().named('error');

export type ExitCode = (code: number) => void;
export const exitCodeId = identifier<ExitCode>();

export type ParseCwd = (dir?: Directory) => Promise<string>;
export const parseCwdId = identifier<ParseCwd>();

export const projectGraphId = identifier<ProjectGraph>();

export const dependenciesModule = createModule(
    bind(consoleLogId).withInstance(
        // eslint-disable-next-line no-console
        console.log
    )
)
    .addBinding(
        bind(consoleErrorId).withInstance(
            // eslint-disable-next-line no-console
            console.error
        )
    )
    .addBinding(
        bind(exitCodeId).withInstance(code => {
            process.exitCode = code;
        })
    )
    .addBinding(bind(parseCwdId).withInstance(parseCwd))
    .addBinding(
        bind(projectGraphId).withAsyncGenerator(createProjectGraphAsync).scoped(singletonScope)
    );

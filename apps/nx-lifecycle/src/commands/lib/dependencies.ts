import type { ProjectGraph } from '@nx/devkit';
import { createProjectGraphAsync, workspaceRoot } from '@nx/devkit';
import { bind, createModule, identifier, singletonScope } from 'haywire';

export type ConsoleLog = (log: unknown) => void;
export const consoleLogId = identifier<ConsoleLog>().named('log');
export const consoleErrorId = identifier<ConsoleLog>().named('error');

export type ExitCode = (code: number) => void;
export const exitCodeId = identifier<ExitCode>();

export const projectGraphId = identifier<ProjectGraph>();
export const workspaceRootId = identifier<string>().named('workspace-root');

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
    .addBinding(
        bind(projectGraphId).withAsyncGenerator(createProjectGraphAsync).scoped(singletonScope)
    )
    .addBinding(bind(workspaceRootId).withInstance(workspaceRoot));

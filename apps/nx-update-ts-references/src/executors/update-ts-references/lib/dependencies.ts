import { isCI } from 'ci-info';
import { bind, createModule, identifier } from 'haywire';

export const isCiId = identifier<boolean>().named('ci');

export type ErrorLogger = (...args: unknown[]) => void;
export const errorLoggerId = identifier<ErrorLogger>().named('error');

export const executorDependenciesModule = createModule(bind(isCiId).withInstance(isCI)).addBinding(
    bind(errorLoggerId).withInstance(
        // eslint-disable-next-line no-console
        console.error
    )
);

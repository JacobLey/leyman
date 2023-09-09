import { readFile, writeFile } from 'node:fs/promises';
import { isCI } from 'ci-info';
import { bind, createModule, identifier } from 'haystack-di';

export interface Logger {
    info: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
}

export const readFileIdentifier = identifier<typeof readFile>();
export const writeFileIdentifier = identifier<typeof writeFile>();
export const isCiIdentifier = identifier<boolean>().named('isCI');
export const loggerIdentifier = identifier<Logger>();

export const dependenciesModule = createModule(
    bind(readFileIdentifier).withInstance(readFile)
).addBinding(
    bind(writeFileIdentifier).withInstance(writeFile)
).addBinding(
    bind(isCiIdentifier).withInstance(isCI)
).addBinding(
    bind(loggerIdentifier).withInstance(console)
);
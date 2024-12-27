import { createRequire } from 'node:module';
import { bind, createModule, identifier } from 'haywire';

export type Logger = (typeof console)['error'];
export const loggerIdentifier = identifier<Logger>();

export type CreateRequire = (path: string) => {
    resolve: globalThis.NodeJS.RequireResolve;
};
export const createRequireId = identifier<CreateRequire>();

export type Importer = (
    specifier: string,
    importCallOptions?: {
        with: { type: 'json' };
    }
) => Promise<unknown>;
export const importIdentifier = identifier<Importer>();

export const dependenciesModule = createModule(
    bind(loggerIdentifier).withInstance(
        // eslint-disable-next-line no-console
        console.error
    )
)
    .addBinding(bind(createRequireId).withInstance(createRequire))
    .addBinding(
        bind(importIdentifier).withInstance(
            async (specifier, options) => import(specifier, options)
        )
    );

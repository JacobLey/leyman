// biome-ignore lint: Doesn't support being disabled directly
import type * as DefaultImport from 'npm-default-import' with { 'resolution-mode': 'import' };
import type { ImportableHandler } from './lib/types.cjs';

let defaultImportProm: Promise<typeof DefaultImport> | null = null;

type ProxyReturnType<Handler extends (...args: any[]) => unknown> =
    ReturnType<Handler> extends Promise<unknown>
        ? // If the wrapped method is already async, keep the type as-is.
          // This helps persist generics and other complicated types that lose granularity when args/return type are separated.
          Handler
        : (...args: Parameters<Handler>) => Promise<Awaited<ReturnType<Handler>>>;

export const commonProxy = <Handler extends (...args: any[]) => unknown>(
    promiseOfHandler: ImportableHandler<Handler> | Promise<ImportableHandler<Handler>>
): ProxyReturnType<Handler> => {
    defaultImportProm ??= import('npm-default-import');
    return (async (...args: unknown[]): Promise<Awaited<ReturnType<Handler>>> => {
        const [{ defaultImport }, mod] = await Promise.all([defaultImportProm!, promiseOfHandler]);

        const handler = defaultImport(mod);
        return handler(...args) as Awaited<ReturnType<Handler>>;
    }) as ProxyReturnType<Handler>;
};

import type * as DefaultImport from 'npm-default-import' with {
    'resolution-mode': 'import',
};

type ImportableHandler<Handler extends (...args: any[]) => unknown> =
    | Handler
    | { default: { default: Handler } }
    | { default: Handler };

let defaultImportProm: Promise<typeof DefaultImport> | null = null;

export const commonProxy = <Handler extends (...args: any[]) => unknown>(
    promiseOfHandler:
        | ImportableHandler<Handler>
        | Promise<ImportableHandler<Handler>>
): ((
    ...args: Parameters<Handler>
) => Promise<Awaited<ReturnType<Handler>>>) => {
    defaultImportProm ??= import('npm-default-import');
    return async (...args): Promise<Awaited<ReturnType<Handler>>> => {
        const [{ defaultImport }, mod] = await Promise.all([
            defaultImportProm!,
            promiseOfHandler,
        ]);

        const handler = defaultImport(mod);
        return handler(...args) as Awaited<ReturnType<Handler>>;
    };
};

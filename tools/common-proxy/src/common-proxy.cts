type ImportableHandler<Handler extends (...args: any[]) => unknown> = Handler
  | { default: Handler } 
  | { default: { default: Handler } };

let defaultImportProm: Promise<typeof import('npm-default-import', { with: { 'resolution-mode': 'import' } })> | null = null;

export const commonProxy = <Handler extends (...args: any[]) => unknown>(
    promiseOfHandler: Promise<ImportableHandler<Handler>> | ImportableHandler<Handler>
): (...args: Parameters<Handler>) => Promise<Awaited<ReturnType<Handler>>> => {
    defaultImportProm ??= import('npm-default-import');
    return async (...args): Promise<Awaited<ReturnType<Handler>>> => {
        const [
            { defaultImport },
            mod,
        ] = await Promise.all([
            defaultImportProm!,
            promiseOfHandler,
        ]);
    
        const handler = defaultImport(mod);
        return handler(...args) as Awaited<ReturnType<Handler>>;
    };
}

import { dirname, resolve } from 'node:path';
import type { ExecutorContext } from '@nx/devkit';
import ts from 'typescript';
import type { BuildOptions } from './schema.js';

interface NormalizedOptions extends BuildOptions {
    projectDir: string;
}

const normalizeOptions = (
    options: BuildOptions,
    context: ExecutorContext
): NormalizedOptions => ({
    tsConfig: resolve(context.root, options.tsConfig),
    projectDir: resolve(
        context.root,
        context.projectsConfigurations!.projects[context.projectName!]!.root
    ),
});

const readConfig = (options: NormalizedOptions): ts.ParsedCommandLine => {
    const configResponse = ts.readConfigFile(
        options.tsConfig,
        ts.sys.readFile.bind(ts.sys)
    );

    if (configResponse.error) {
        throw new Error(
            ts.flattenDiagnosticMessageText(
                configResponse.error.messageText,
                ts.sys.newLine,
                2
            )
        );
    }

    const parsed = ts.parseJsonConfigFileContent(
        configResponse.config,
        ts.sys,
        dirname(options.tsConfig)
    );
    if (parsed.errors.length > 0) {
        throw new Error(
            parsed.errors
                .map(err =>
                    ts.flattenDiagnosticMessageText(
                        err.messageText,
                        ts.sys.newLine,
                        2
                    )
                )
                .join('\n')
        );
    }

    return {
        ...parsed,
        options: {
            typeRoots: [resolve(options.projectDir, 'node_modules', '@types')],
            ...ts.getDefaultCompilerOptions(),
            ...parsed.options,
        },
    };
};

const reportIfFailure = (results: ts.EmitResult): void => {
    const containsError = results.diagnostics.some(
        diagnostic => diagnostic.category === ts.DiagnosticCategory.Error
    );

    if (containsError) {
        throw new Error(
            ts.formatDiagnosticsWithColorAndContext(results.diagnostics, {
                getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
                getNewLine: () => ts.sys.newLine,
                getCanonicalFileName: name => name,
            })
        );
    }
};

/**
 * Primary entrypoint for tsc command for Nx.
 *
 * @param options - build options passed from project.json
 * @param context - Nx/project/command specific context
 * @returns success
 */
export const tsc = async (
    options: BuildOptions,
    context: ExecutorContext
): Promise<{ success: boolean }> => {
    const normalized = normalizeOptions(options, context);

    const tsConfig = readConfig(normalized);

    const host = ts.createCompilerHost(tsConfig.options);

    const program = ts.createProgram({
        rootNames: tsConfig.fileNames,
        options: tsConfig.options,
        host,
    });

    const results = program.emit();

    reportIfFailure(results);

    return { success: true };
};

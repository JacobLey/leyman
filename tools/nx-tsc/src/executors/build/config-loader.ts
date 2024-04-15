import { dirname, isAbsolute, resolve } from 'node:path';
import ts from 'typescript';
import { identifier } from 'haywire';
import type { NormalizedOptions } from './normalizer.js';

/**
 * Additional fields that come from tsconfig, but are now guaranteed to
 * exist and to be properly formatted.
 */
export interface TsConfigSettings {
    outDir: string;
    rootDir: string;
}

export interface ExtendedTsConfig extends ts.ParsedCommandLine {
    /**
     * Additional fields that come from tsconfig, but are now guaranteed to
     * exist and to be properly formatted.
     */
    settings: TsConfigSettings;
}

export type ConfigLoader = (options: NormalizedOptions) => ExtendedTsConfig;
export const configLoaderId = identifier<ConfigLoader>();

type AbsolutePathAsserter = (name: string, dir: string | undefined) => asserts dir is string;
const assertIsAbsolutePath: AbsolutePathAsserter = (
    name: string,
    dir: string | undefined
): asserts dir is string => {
    if (!dir) {
        throw new Error(`Setting \`${name}\` is not provided`);
    }
    if (!isAbsolute(dir)) {
        throw new Error(`Setting \`${name}\` is not an absolute path: \`${dir}\``);
    }
};

export const configLoaderProvider = (
    readConfigFile: typeof ts.readConfigFile,
    readFile: typeof ts.sys.readFile,
    flattenDiagnosticMessageText: typeof ts.flattenDiagnosticMessageText,
    parseJsonConfigFileContent: typeof ts.parseJsonConfigFileContent,
    defaultCompilerOptions: ts.CompilerOptions
): ConfigLoader => {
    const flattenMessage = (messageText: string | ts.DiagnosticMessageChain): string =>
        flattenDiagnosticMessageText(messageText, ts.sys.newLine, 2);

    return tscOptions => {
        const configResponse = readConfigFile(tscOptions.tsConfig, readFile);

        if (configResponse.error) {
            throw new Error(flattenMessage(configResponse.error.messageText));
        }

        const parsed = parseJsonConfigFileContent(
            configResponse.config,
            ts.sys,
            dirname(tscOptions.tsConfig)
        );
        if (parsed.errors.length > 0) {
            throw new Error(parsed.errors.map(err => flattenMessage(err.messageText)).join('\n'));
        }

        const options = {
            typeRoots: [resolve(tscOptions.projectDir, 'node_modules', '@types')],
            ...defaultCompilerOptions,
            ...parsed.options,
        };

        const { outDir, rootDir } = options;

        assertIsAbsolutePath('outDir', outDir);
        assertIsAbsolutePath('rootDir', rootDir);

        return {
            ...parsed,
            options,
            settings: {
                outDir,
                rootDir,
            },
        };
    };
};

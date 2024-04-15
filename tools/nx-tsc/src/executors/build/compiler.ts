import type fs from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import type swc from '@swc/core';
import type ts from 'typescript';
import { identifier } from 'haywire';
import type { ExtendedTsConfig, TsConfigSettings } from './config-loader.js';
import type { FailureReporter } from './failure-reporter.js';
import type { NormalizedOptions } from './normalizer.js';

/**
 * Using user-input plus options parsed from `tsconfig.json`, populate the `outDir` with
 * - transpiled code
 * - type declarations
 * - map files of both
 *
 * returns a list of all files written to `outDir`.
 */
export type Compiler = (
    options: NormalizedOptions,
    settings: ExtendedTsConfig
) => Promise<string[]>;
export const compilerId = identifier<Compiler>();

const isFileModule = (filename: string, isPackageModule: boolean): boolean => {
    const [extension] = /\.[cm]?js$/u.exec(filename) ?? [''];
    if (extension.includes('c')) {
        return false;
    }
    return extension.includes('m') || isPackageModule;
};

interface OutputFiles {
    js: {
        file: string;
        map: string;
    };
    types: {
        file: string;
        map: string;
    };
}
const getOutputtedFiles = (filename: string, settings: TsConfigSettings): OutputFiles => {
    const relativePath = relative(settings.rootDir, filename);

    // Remove the `x` from jsx file
    const outputTypeName = basename(filename).replace(/\.[cm]?tsx$/u, val => val.slice(0, -1));
    const outputTypeDeclaration = outputTypeName.replace(/\.[cm]?ts$/u, val => `.d${val}`);
    // Swap the `t` with a `j`
    const outputFileName = outputTypeName.replace(/\.[cm]?ts$/u, val => val.replace('t', 'j'));

    const baseOutputPath = join(settings.outDir, relativePath, '..');
    const outputPath = join(baseOutputPath, outputFileName);
    const outputTypesPath = join(baseOutputPath, outputTypeDeclaration);

    return {
        js: {
            file: outputPath,
            map: `${outputPath}.map`,
        },
        types: {
            file: outputTypesPath,
            map: `${outputTypesPath}.map`,
        },
    };
};

export const compilerProvider = (
    createCompilerHost: typeof ts.createCompilerHost,
    createProgram: typeof ts.createProgram,
    failureReporter: FailureReporter,
    transformFile: typeof swc.transformFile,
    writeFile: typeof fs.writeFile
): Compiler => {
    const fileTransform = async (
        filename: string,
        options: NormalizedOptions,
        outputFiles: OutputFiles
    ): Promise<void> => {
        const jsBaseName = basename(outputFiles.js.file);

        const transformed = await transformFile(filename, {
            filename,
            isModule: true,
            // Force emitting source maps
            sourceMaps: true,
            sourceFileName: relative(dirname(outputFiles.js.map), filename),
            inlineSourcesContent: false,
            sourceRoot: '',
            // All settings provided here, don't try to load from elsewhere
            swcrc: false,
            jsc: {
                parser: {
                    syntax: 'typescript',
                    decorators: true,
                    dynamicImport: true,
                    tsx: true,
                },
                transform: {
                    react: {
                        // Use `__jsx` instead of `React`
                        runtime: 'automatic',
                    },
                },
                experimental: {
                    keepImportAttributes: true,
                },
                // Removes comments
                minify: {
                    compress: false,
                    mangle: false,
                },
            },
            module: {
                type: isFileModule(jsBaseName, options.isModule) ? 'es6' : 'commonjs',
                ignoreDynamic: true,
            },
            env: {
                // Somehow this is the only way to actually support dynamic import in commonjs
                targets: 'last 1 node versions',
                dynamicImport: true,
            },
        });

        const parsedSourceMap: unknown = JSON.parse(transformed.map!);
        const sourceMapWithFile = JSON.stringify({
            ...(parsedSourceMap as object),
            file: jsBaseName,
        });

        const attachedSourcedMapUrl = `${transformed.code}//# sourceMappingURL=${basename(
            outputFiles.js.map
        )}\n`;

        await Promise.all([
            writeFile(outputFiles.js.file, attachedSourcedMapUrl, 'utf8'),
            writeFile(outputFiles.js.map, sourceMapWithFile, 'utf8'),
        ]);
    };

    const compiler: Compiler = async (options, tsConfig) => {
        const host = createCompilerHost({
            ...tsConfig.options,
            emitDeclarationOnly: true,
        });

        const program = createProgram({
            rootNames: tsConfig.fileNames,
            options: tsConfig.options,
            host,
        });

        const results = program.emit();

        failureReporter(results);

        // Ignore
        getOutputtedFiles('', tsConfig.settings);

        const outputted = await Promise.all(
            tsConfig.fileNames.map(async filename => {
                const outputtedFiles = getOutputtedFiles(filename, tsConfig.settings);
                await fileTransform(filename, options, outputtedFiles);
                return [
                    outputtedFiles.js.file,
                    outputtedFiles.js.map,
                    outputtedFiles.types.file,
                    outputtedFiles.types.map,
                ];
            })
        );

        return outputted.flat();
    };

    return compiler;
};

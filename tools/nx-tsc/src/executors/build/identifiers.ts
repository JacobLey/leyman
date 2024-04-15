import { readFile, rm, writeFile } from 'node:fs/promises';
import { transformFile } from '@swc/core';
import ts from 'typescript';
import { bind, createModule, identifier } from 'haywire';

export const readFileId = identifier<typeof readFile>();
export const rmId = identifier<typeof rm>();
export const writeFileId = identifier<typeof writeFile>();

const fsModule = createModule(bind(readFileId).withInstance(readFile))
    .addBinding(bind(rmId).withInstance(rm))
    .addBinding(bind(writeFileId).withInstance(writeFile));

export const transformFileId = identifier<typeof transformFile>();

const swcModule = createModule(bind(transformFileId).withInstance(transformFile));

export const createCompilerHostId = identifier<typeof ts.createCompilerHost>();
export const createProgramId = identifier<typeof ts.createProgram>();
export const flattenDiagnosticMessageTextId = identifier<typeof ts.flattenDiagnosticMessageText>();
export const formatDiagnosticsWithColorAndContextId =
    identifier<typeof ts.formatDiagnosticsWithColorAndContext>();
export const defaultCompilerOptionsId = identifier<ts.CompilerOptions>();
export const parseJsonConfigFileContentId = identifier<typeof ts.parseJsonConfigFileContent>();
export const readConfigFileId = identifier<typeof ts.readConfigFile>();
export const readJsonConfigFileId = identifier<typeof ts.readJsonConfigFile>();
export const tsReadFileId = identifier<typeof ts.sys.readFile>();

const tsModule = createModule(bind(createCompilerHostId).withInstance(ts.createCompilerHost))
    .addBinding(bind(createProgramId).withInstance(ts.createProgram))
    .addBinding(bind(flattenDiagnosticMessageTextId).withInstance(ts.flattenDiagnosticMessageText))
    .addBinding(
        bind(formatDiagnosticsWithColorAndContextId).withInstance(
            ts.formatDiagnosticsWithColorAndContext
        )
    )
    .addBinding(bind(defaultCompilerOptionsId).withInstance(ts.getDefaultCompilerOptions()))
    .addBinding(bind(parseJsonConfigFileContentId).withInstance(ts.parseJsonConfigFileContent))
    .addBinding(bind(readConfigFileId).withInstance(ts.readConfigFile))
    // eslint-disable-next-line @typescript-eslint/unbound-method
    .addBinding(bind(tsReadFileId).withInstance(ts.sys.readFile))
    .addBinding(bind(readJsonConfigFileId).withInstance(ts.readJsonConfigFile));

export const externalModule = fsModule.mergeModule(swcModule).mergeModule(tsModule);

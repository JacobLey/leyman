import type { Context } from 'mocha';
import Path from 'node:path';
import ts from 'typescript';
import { before } from 'mocha-chain';

/**
 * Root of this package. Virtual files are placed inside it so `juniper` and `expect-type` resolve
 * from its `node_modules`, and fixtures in `test/` can be imported by their source path.
 */
export const packageRoot = Path.resolve(import.meta.dirname, '../..');
const virtualRoot = Path.join(packageRoot, 'test', '__virtual__');

const compilerOptions: ts.CompilerOptions = {
    exactOptionalPropertyTypes: true,
    lib: ['lib.esnext.d.ts'],
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    noUncheckedIndexedAccess: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ESNext,
    types: [],
};

/**
 * Parsed files that never change between checks (TypeScript's libs, `node_modules`, fixtures),
 * so each check only parses its own virtual files.
 */
const sourceFileCache = new Map<string, ts.SourceFile>();

const realHost = ts.createCompilerHost(compilerOptions, true);

/**
 * Type-check virtual TypeScript files, as if they were in `test/__virtual__/`.
 *
 * @param files - file contents, keyed by file name (e.g. `generated.ts`)
 * @returns formatted diagnostics of the virtual files, empty if they type-check
 */
export const typeCheck = (files: Readonly<Record<string, string>>): string[] => {
    const virtualFiles = new Map(
        Object.entries(files).map(([name, content]) => [Path.join(virtualRoot, name), content])
    );
    const host: ts.CompilerHost = {
        ...realHost,
        directoryExists: directoryName =>
            directoryName === virtualRoot || realHost.directoryExists!(directoryName),
        fileExists: fileName => virtualFiles.has(fileName) || realHost.fileExists(fileName),
        readFile: fileName => virtualFiles.get(fileName) ?? realHost.readFile(fileName),
        getSourceFile: (fileName, languageVersion) => {
            const virtual = virtualFiles.get(fileName);
            if (virtual !== undefined) {
                return ts.createSourceFile(fileName, virtual, languageVersion, true);
            }
            let sourceFile = sourceFileCache.get(fileName);
            if (!sourceFile) {
                sourceFile = realHost.getSourceFile(fileName, languageVersion);
                if (sourceFile) {
                    sourceFileCache.set(fileName, sourceFile);
                }
            }
            return sourceFile;
        },
    };

    const program = ts.createProgram(virtualFiles.keys().toArray(), compilerOptions, host);
    return virtualFiles
        .keys()
        .flatMap(fileName =>
            ts
                .getPreEmitDiagnostics(program, program.getSourceFile(fileName))
                .map(diagnostic => ts.formatDiagnostic(diagnostic, realHost))
        )
        .toArray();
};

// The first check parses TypeScript's libs and `expect-type`, which takes seconds on a loaded CI machine, then
// `sourceFileCache` keeps them. A root hook does it once, before any test, so it never counts against whichever
// test happens to run first.
before(function (this: Context) {
    this.timeout(30_000);
    typeCheck({
        'warm.ts':
            "import { expectTypeOf } from 'expect-type';\nexpectTypeOf<1>().toEqualTypeOf<1>();",
    });
});

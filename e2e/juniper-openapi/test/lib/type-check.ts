import Path from 'node:path';
import ts from 'typescript';

// Virtual files are placed inside the package, so imports resolve from its `node_modules`, and
// `test/data/` can be imported by its source path.
const virtualRoot = Path.resolve(import.meta.dirname, '../../test/__virtual__');

const compilerOptions: ts.CompilerOptions = {
    exactOptionalPropertyTypes: true,
    lib: ['lib.esnext.d.ts'],
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ESNext,
    types: [],
};

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
            return virtual === undefined
                ? realHost.getSourceFile(fileName, languageVersion)
                : ts.createSourceFile(fileName, virtual, languageVersion, true);
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

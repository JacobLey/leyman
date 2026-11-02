import Path from 'node:path';
import ts from 'typescript';

/**
 * Root of this package. Virtual files are placed inside it, so what they import resolves from its `node_modules`.
 */
export const packageRoot = Path.resolve(import.meta.dirname, '..');
const virtualRoot = Path.join(packageRoot, 'src');

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
 * Parsed files that never change between checks, so each check only parses its own virtual files.
 */
const sourceFileCache = new Map<string, ts.SourceFile>();
const realHost = ts.createCompilerHost(compilerOptions, true);

/**
 * What a file's diagnostics say.
 */
export interface Diagnostic {
    /**
     * Zero-based line.
     */
    readonly line: number;
    /**
     * The message.
     */
    readonly message: string;
}

/**
 * Type-check virtual TypeScript files, as if they were in this package.
 *
 * @param files - file contents, keyed by file name
 * @returns diagnostics of each virtual file, keyed by file name
 */
export const typeCheck = (
    files: Readonly<Record<string, string>>
): Record<string, readonly Diagnostic[]> => {
    const virtualFiles = new Map(
        Object.entries(files).map(([name, content]) => [Path.join(virtualRoot, name), content])
    );
    const host: ts.CompilerHost = {
        ...realHost,
        fileExists: fileName => virtualFiles.has(fileName) || realHost.fileExists(fileName),
        readFile: fileName => virtualFiles.get(fileName) ?? realHost.readFile(fileName),
        getSourceFile: (fileName, languageVersion) => {
            const virtual = virtualFiles.get(fileName);
            if (virtual !== undefined) {
                return ts.createSourceFile(fileName, virtual, languageVersion, true);
            }
            const cached = sourceFileCache.get(fileName);
            if (cached) {
                return cached;
            }
            const sourceFile = realHost.getSourceFile(fileName, languageVersion);
            sourceFileCache.set(fileName, sourceFile!);
            return sourceFile;
        },
    };
    const program = ts.createProgram(virtualFiles.keys().toArray(), compilerOptions, host);
    return Object.fromEntries(
        Object.keys(files).map(name => {
            const sourceFile = program.getSourceFile(Path.join(virtualRoot, name))!;
            return [
                name,
                ts.getPreEmitDiagnostics(program, sourceFile).map(diagnostic => ({
                    line: sourceFile.getLineAndCharacterOfPosition(diagnostic.start!).line,
                    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
                })),
            ];
        })
    );
};

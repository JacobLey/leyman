import ts from 'typescript';
import { identifier } from 'haywire';

export type FailureReporter = (results: ts.EmitResult) => void;
export const failureReporterId = identifier<FailureReporter>();

export const failureReporterProvider =
    (
        formatDiagnosticsWithColorAndContext: typeof ts.formatDiagnosticsWithColorAndContext
    ): FailureReporter =>
    (results: ts.EmitResult): void => {
        const containsError = results.diagnostics.some(
            diagnostic => diagnostic.category === ts.DiagnosticCategory.Error
        );

        if (containsError) {
            throw new Error(
                formatDiagnosticsWithColorAndContext(results.diagnostics, {
                    // eslint-disable-next-line @typescript-eslint/unbound-method
                    getCurrentDirectory: ts.sys.getCurrentDirectory,
                    getNewLine: () => ts.sys.newLine,
                    getCanonicalFileName: name => name,
                })
            );
        }
    };

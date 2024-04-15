import { bind, createContainer } from 'haywire';
import { handler } from 'nx-plugin-handler';
import { compilerId, compilerProvider } from './compiler.js';
import { configLoaderId, configLoaderProvider } from './config-loader.js';
import { failureReporterId, failureReporterProvider } from './failure-reporter.js';
import * as ids from './identifiers.js';
import { normalizeOptionsId, normalizeOptionsProvider } from './normalizer.js';
import { outputCleanerId, outputCleanerProvider } from './output-cleaner.js';
import { tscId, tscProvider } from './tsc.js';

const tscModule = ids.externalModule
    .addBinding(
        bind(compilerId)
            .withProvider(compilerProvider)
            .withDependencies([
                ids.createCompilerHostId,
                ids.createProgramId,
                failureReporterId,
                ids.transformFileId,
                ids.writeFileId,
            ])
    )
    .addBinding(
        bind(configLoaderId)
            .withProvider(configLoaderProvider)
            .withDependencies([
                ids.readConfigFileId,
                ids.tsReadFileId,
                ids.flattenDiagnosticMessageTextId,
                ids.parseJsonConfigFileContentId,
                ids.defaultCompilerOptionsId,
            ])
    )
    .addBinding(
        bind(failureReporterId)
            .withProvider(failureReporterProvider)
            .withDependencies([ids.formatDiagnosticsWithColorAndContextId])
    )
    .addBinding(
        bind(normalizeOptionsId)
            .withProvider(normalizeOptionsProvider)
            .withDependencies([ids.readFileId])
    )
    .addBinding(
        bind(outputCleanerId).withProvider(outputCleanerProvider).withDependencies([ids.rmId])
    )
    .addBinding(
        bind(tscId)
            .withProvider(tscProvider)
            .withDependencies([normalizeOptionsId, configLoaderId, outputCleanerId, compilerId])
    );

export default handler(createContainer(tscModule).get(tscId));

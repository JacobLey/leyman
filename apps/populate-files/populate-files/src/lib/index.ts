import type { SafeLoadFile } from './loader.js';
import type { InternalPopulateFile } from './populate-file.js';
import { bind, identifier, singletonScope } from 'haywire';
import {
    ciId,
    dependenciesModule,
    mkdirId,
    parseCwdId,
    readFileId,
    textFormatterId,
    writeFileId,
} from './lib/dependencies-module.js';
import { Loader } from './loader.js';
import { Normalize } from './normalize.js';
import { PopulateFile } from './populate-file.js';

const safeLoadFileId = identifier<SafeLoadFile>();
export const internalPopulateFileId = identifier<InternalPopulateFile>();

export const populateFilesModule = dependenciesModule
    .addBinding(
        bind(safeLoadFileId)
            .withDependencies([Loader])
            .withProvider(l => l.safeLoadFile)
    )
    .addBinding(
        bind(Loader).withDependencies([readFileId]).withConstructorProvider().scoped(singletonScope)
    )
    .addBinding(
        bind(Normalize)
            .withDependencies([ciId, parseCwdId, textFormatterId])
            .withConstructorProvider()
            .scoped(singletonScope)
    )
    .addBinding(
        bind(PopulateFile)
            .withDependencies([safeLoadFileId, mkdirId, writeFileId])
            .withConstructorProvider()
            .scoped(singletonScope)
    )
    .addBinding(
        bind(internalPopulateFileId)
            .withDependencies([PopulateFile])
            .withProvider(p => p.internalPopulateFile)
    );

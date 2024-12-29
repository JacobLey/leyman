import { bind, identifier, singletonScope } from 'haywire';
import { dependencies, importerId, parseCwdId, populateFilesId } from './lib/dependencies.js';
import { type LoadAndPopulateFiles, LoadPopulateFilesFactory } from './load-populate-files.js';
import { type LoadFile, loadFileProvider } from './loader.js';
import { type NormalizeParams, normalizeParamsProvider } from './normalize.js';

const normalizeParamsId = identifier<NormalizeParams>();
const loadFileId = identifier<LoadFile>();
export const loadAndPopulateFilesId = identifier<LoadAndPopulateFiles>();

export const loadAndPopulateFilesModule = dependencies
    .addBinding(
        bind(LoadPopulateFilesFactory)
            .withDependencies([normalizeParamsId, loadFileId, populateFilesId])
            .withConstructorProvider()
            .scoped(singletonScope)
    )
    .addBinding(
        bind(loadAndPopulateFilesId)
            .withDependencies([LoadPopulateFilesFactory])
            .withProvider(factory => factory.loadAndPopulateFiles)
    )
    .addBinding(bind(loadFileId).withDependencies([importerId]).withProvider(loadFileProvider))
    .addBinding(
        bind(normalizeParamsId).withDependencies([parseCwdId]).withProvider(normalizeParamsProvider)
    );

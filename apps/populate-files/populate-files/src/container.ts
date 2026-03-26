import { bind, createContainer } from 'haywire';
import { internalPopulateFileId, populateFilesModule, readdirId, rmId } from './lib/index.js';
import { Normalize } from './lib/normalize.js';
import { PopulateFileFactory } from './populate-file.js';

export const populateFilesContainer = createContainer(
    populateFilesModule.addBinding(
        bind(PopulateFileFactory)
            .withDependencies([Normalize, internalPopulateFileId, readdirId, rmId])
            .withConstructorProvider()
    )
);

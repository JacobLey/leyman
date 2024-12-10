import { bind, createContainer } from 'haywire';
import { internalPopulateFileId, populateFilesModule } from './lib/index.js';
import { Normalize } from './lib/normalize.js';
import { PopulateFileFactory } from './populate-file.js';

export type { PopulateFile, PopulateFiles } from './populate-file.js';
export type {
    FileContent,
    PopulateFileParams,
    PopulationResponse,
} from './lib/lib/types.js';

const populateFileFactory = createContainer(
    populateFilesModule.addBinding(
        bind(PopulateFileFactory)
            .withDependencies([Normalize, internalPopulateFileId])
            .withConstructorProvider()
    )
).get(PopulateFileFactory);

export const { populateFile, populateFiles } = populateFileFactory;

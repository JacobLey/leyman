import { populateFilesContainer } from './container.js';
import { PopulateFileFactory } from './populate-file.js';

export type { PopulateFile, PopulateFiles } from './populate-file.js';
export type {
    FileContent,
    PopulateFileParams,
    PopulationResponse,
} from './lib/lib/types.js';

const populateFileFactory = populateFilesContainer.get(PopulateFileFactory);

export const { populateFile, populateFiles } = populateFileFactory;

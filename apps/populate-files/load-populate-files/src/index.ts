import { createContainer } from 'haywire';
import { loadAndPopulateFilesId, loadAndPopulateFilesModule } from './lib/index.js';

export type { PopulateFileParams } from 'populate-files';
export type { LoadAndPopulateFiles } from './lib/load-populate-files.js';
export const loadAndPopulateFiles = createContainer(loadAndPopulateFilesModule).get(
    loadAndPopulateFilesId
);

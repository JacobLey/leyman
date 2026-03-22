import { loadPopulateContainer } from './container.js';
import { loadAndPopulateFilesId } from './lib/index.js';

export type { PopulateFileParams } from 'populate-files';
export type { LoadAndPopulateFiles } from './lib/load-populate-files.js';
export const loadAndPopulateFiles = loadPopulateContainer.get(loadAndPopulateFilesId);

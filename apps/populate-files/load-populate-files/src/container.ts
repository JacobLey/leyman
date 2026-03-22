import { createContainer } from 'haywire';
import { loadAndPopulateFilesModule } from './lib/index.js';

export const loadPopulateContainer = createContainer(loadAndPopulateFilesModule);

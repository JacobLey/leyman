import { createContainer, createModule } from 'haywire';
import { loadPopulateFilesCliBinding } from './cli.js';
import { loadPopulateFilesCommandBinding } from './commands/load-populate-files-command.js';

export const cliModule = createModule(loadPopulateFilesCliBinding).addBinding(
    loadPopulateFilesCommandBinding
);

export const cliContainer = createContainer(cliModule);

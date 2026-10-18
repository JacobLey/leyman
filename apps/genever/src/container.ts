import { createContainer, createModule } from 'haywire';
import { geneverCliBinding } from './cli.js';
import { geneverCommandBinding } from './commands/genever-command.js';

export const cliModule = createModule(geneverCliBinding).addBinding(geneverCommandBinding);

export const cliContainer = createContainer(cliModule);

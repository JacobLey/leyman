import { createContainer, createModule } from 'haywire';
import { decantCliBinding } from './cli.js';
import { decantCommandBinding } from './commands/decant-command.js';

export const cliModule = createModule(decantCliBinding).addBinding(decantCommandBinding);

export const cliContainer = createContainer(cliModule);

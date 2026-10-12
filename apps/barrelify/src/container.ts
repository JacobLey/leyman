import { createContainer, createModule } from 'haywire';
import { barrelCliBinding } from './cli.js';
import { barrelCommandBinding } from './commands/barrel-command.js';

export const cliModule = createModule(barrelCliBinding).addBinding(barrelCommandBinding);

export const cliContainer = createContainer(cliModule);

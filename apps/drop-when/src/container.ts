import { createContainer, createModule } from 'haywire';
import { dropWhenCliBinding } from './cli.js';
import { checkCommandBinding } from './commands/check-command.js';

export const cliModule = createModule(dropWhenCliBinding).addBinding(checkCommandBinding);

export const cliContainer = createContainer(cliModule);

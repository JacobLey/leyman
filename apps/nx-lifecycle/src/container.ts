import { createContainer, createModule } from 'haywire';
import { lifecycleCliBinding } from './cli.js';
import { explainCommandBinding } from './commands/explain-command.js';
import { lifecycleCommandBinding } from './commands/lifecycle-command.js';

export const cliModule = createModule(lifecycleCliBinding)
    .addBinding(lifecycleCommandBinding)
    .addBinding(explainCommandBinding);

export const cliContainer = createContainer(cliModule);

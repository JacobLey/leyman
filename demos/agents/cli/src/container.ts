import { createContainer, createModule } from 'haywire';
import { notesCliBinding } from './cli.js';
import { noteAddCommandBinding } from './commands/add-command.js';
import { noteGetCommandBinding } from './commands/get-command.js';
import { listCommandBinding } from './commands/list-command.js';
import { loginCommandBinding } from './commands/login-command.js';
import { logoutCommandBinding } from './commands/logout-command.js';

export const cliModule = createModule(notesCliBinding)
    .addBinding(loginCommandBinding)
    .addBinding(logoutCommandBinding)
    .addBinding(listCommandBinding)
    .addBinding(noteGetCommandBinding)
    .addBinding(noteAddCommandBinding);

export const cliContainer = createContainer(cliModule);

import { createContainer, createModule } from 'haywire';
import { pgDollySchemaCliBinding } from './cli.js';
import { snapshotCommandBinding } from './commands/snapshot-command.js';

export const cliModule = createModule(pgDollySchemaCliBinding).addBinding(snapshotCommandBinding);

export const cliContainer = createContainer(cliModule);

import { bind, createContainer, createModule } from 'haywire';
import { dropWhenCliBinding } from './cli.js';
import { checkCommandBinding } from './commands/check-command.js';
import { clockId, fetchId } from './commands/lib/dependencies.js';
import { reportCommandBinding } from './commands/report-command.js';

export const cliModule = createModule(dropWhenCliBinding)
    .addBinding(checkCommandBinding)
    .addBinding(reportCommandBinding)
    .addBinding(bind(fetchId).withInstance(fetch))
    .addBinding(bind(clockId).withInstance(() => Temporal.Now.instant()));

export const cliContainer = createContainer(cliModule);

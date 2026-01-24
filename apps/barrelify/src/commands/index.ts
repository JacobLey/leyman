import type { AbstractCommand } from './lib/types.js';
import { bind, createModule, identifier } from 'haywire';
import { Barrel } from '../lib/barrel.js';
import { consoleLogId, parseCwdId } from '../lib/dependencies.js';
import { BarrelCommand } from './barrel-command.js';

export const commandsId = identifier<AbstractCommand[]>();

export const commandsModule = createModule(
    bind(commandsId)
        .withDependencies([BarrelCommand])
        .withProvider((...commands) => commands)
).addBinding(
    bind(BarrelCommand)
        .withDependencies([Barrel, consoleLogId, parseCwdId])
        .withConstructorProvider()
);

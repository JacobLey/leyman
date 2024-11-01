import { bind, createModule, identifier } from 'haywire';
import { Barrel } from '../lib/barrel.js';
import { consoleErrorId, consoleLogId, exitCodeId, parseCwdId } from '../lib/dependencies.js';
import { BarrelCommand } from './barrel-command.js';
import type { AbstractCommand } from './lib/types.js';

export const commandsId = identifier<AbstractCommand[]>();

export const commandsModule = createModule(
    bind(commandsId)
        .withDependencies([BarrelCommand])
        .withProvider((...commands) => commands)
).addBinding(
    bind(BarrelCommand)
        .withDependencies([Barrel, consoleLogId, consoleErrorId, exitCodeId, parseCwdId])
        .withConstructorProvider()
);

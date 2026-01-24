import type { AbstractCommand } from './lib/types.js';
import { bind, createModule, identifier } from 'haywire';
import { parseCwdId, populateFileId } from '../lib/dependencies.js';
import { getPrunedLockfileId } from '../lib/pruned-lockfile.js';
import { LockfileCommand } from './lockfile-command.js';

export const commandsId = identifier<AbstractCommand[]>();

export const commandsModule = createModule(
    bind(commandsId)
        .withDependencies([LockfileCommand])
        .withProvider((...commands) => commands)
).addBinding(
    bind(LockfileCommand)
        .withDependencies([parseCwdId, getPrunedLockfileId, populateFileId])
        .withConstructorProvider()
);

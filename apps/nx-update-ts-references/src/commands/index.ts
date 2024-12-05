import { bind, identifier } from 'npm-haywire';
import { readFileId } from '../lib/dependencies-module.js';
import { updateTsReferencesId } from '../lib/update-ts-references.js';
import { dependenciesModule, parseCwdId, projectGraphId } from './lib/dependencies.js';
import type { AbstractCommand } from './lib/types.js';
import { UpdateTsReferencesCommand } from './update-ts-references-command.js';

export const commandsId = identifier<AbstractCommand[]>();

export const commandsModule = dependenciesModule
    .addBinding(
        bind(commandsId)
            .withDependencies([UpdateTsReferencesCommand])
            .withProvider((...commands) => commands)
    )
    .addBinding(
        bind(UpdateTsReferencesCommand)
            .withDependencies([
                updateTsReferencesId,
                parseCwdId,
                projectGraphId.supplier('async'),
                readFileId,
            ])
            .withProvider((...args) => new UpdateTsReferencesCommand(...args))
    );

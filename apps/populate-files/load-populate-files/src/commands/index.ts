import { bind, identifier } from 'haywire';
import { loadAndPopulateFilesId, loadAndPopulateFilesModule } from '../lib/index.js';
import { dependenciesModule } from './lib/dependencies.js';
import type { AbstractCommand } from './lib/types.js';
import { LoadPopulateFilesCommand } from './load-populate-files-command.js';

export const commandsId = identifier<AbstractCommand[]>();

export const commandsModule = dependenciesModule
    .mergeModule(loadAndPopulateFilesModule)
    .addBinding(
        bind(commandsId)
            .withDependencies([LoadPopulateFilesCommand])
            .withProvider((...commands) => commands)
    )
    .addBinding(
        bind(LoadPopulateFilesCommand)
            .withDependencies([loadAndPopulateFilesId])
            .withConstructorProvider()
    );

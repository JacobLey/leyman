import type { AbstractCommand } from './lib/types.js';
import { bind, identifier } from 'haywire';
import { nxDaggerId, nxDaggerModule } from '../generate/index.js';
import { GenerateCommand } from './generate-command.js';
import { dependenciesModule, projectGraphId } from './lib/dependencies.js';

export const commandsId = identifier<AbstractCommand[]>();

export const commandsModule = dependenciesModule
    .mergeModule(nxDaggerModule)
    .addBinding(
        bind(commandsId)
            .withDependencies([GenerateCommand])
            .withProvider((...commands) => commands)
    )
    .addBinding(
        bind(GenerateCommand)
            .withDependencies([projectGraphId.supplier('async'), nxDaggerId])
            .withConstructorProvider()
    );

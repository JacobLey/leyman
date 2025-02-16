import { EntryScript } from 'entry-script';
import { bind, singletonScope } from 'haywire';
import { launch } from 'haywire-launcher';
import { UpdateTsReferencesCli } from './cli.js';
import { commandsId, commandsModule } from './commands/index.js';
import { consoleErrorId, consoleLogId, exitCodeId } from './commands/lib/dependencies.js';
import { dependenciesModule } from './lib/dependencies-module.js';

export default launch(
    commandsModule
        .mergeModule(dependenciesModule)
        .addBinding(
            bind(EntryScript)
                .withDependencies([UpdateTsReferencesCli])
                .withProvider(cli => cli)
                .scoped(singletonScope)
        )
        .addBinding(
            bind(UpdateTsReferencesCli)
                .withDependencies([commandsId.supplier(), consoleLogId, consoleErrorId, exitCodeId])
                .withConstructorProvider()
                .scoped(singletonScope)
        )
        .toContainer()
);

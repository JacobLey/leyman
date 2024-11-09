import { EntryScript } from 'entry-script';
import { bind, singletonScope } from 'haywire';
import { launch } from 'haywire-launcher';
import { BarrelCli } from './cli.js';
import { commandsId, commandsModule } from './commands/index.js';
import { consoleErrorId, consoleLogId, exitCodeId } from './lib/dependencies.js';
import { barrelModule } from './lib/index.js';

export default launch(
    commandsModule
        .mergeModule(barrelModule)
        .addBinding(
            bind(EntryScript)
                .withDependencies([BarrelCli])
                .withProvider(cli => cli)
                .scoped(singletonScope)
        )
        .addBinding(
            bind(BarrelCli)
                .withDependencies([commandsId.supplier(), consoleLogId, consoleErrorId, exitCodeId])
                .withConstructorProvider()
                .scoped(singletonScope)
        )
        .toContainer()
);

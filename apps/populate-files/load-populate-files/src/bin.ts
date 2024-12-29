import { EntryScript } from 'entry-script';
import { bind, singletonScope } from 'haywire';
import { launch } from 'haywire-launcher';
import { LoadPopulateFilesCli } from './cli.js';
import { commandsId, commandsModule } from './commands/index.js';
import { consoleErrorId, consoleLogId, exitCodeId } from './commands/lib/dependencies.js';

export default launch(
    commandsModule
        .addBinding(
            bind(EntryScript)
                .withDependencies([LoadPopulateFilesCli])
                .withProvider(cli => cli)
                .scoped(singletonScope)
        )
        .addBinding(
            bind(LoadPopulateFilesCli)
                .withDependencies([commandsId.supplier(), consoleLogId, consoleErrorId, exitCodeId])
                .withConstructorProvider()
                .scoped(singletonScope)
        )
        .toContainer()
);

import { EntryScript } from 'npm-entry-script';
import { bind, singletonScope } from 'npm-haywire';
import { launch } from 'npm-haywire-launcher';
import { LockfileCli } from './cli.js';
import { commandsId, commandsModule } from './commands/index.js';
import { consoleErrorId, consoleLogId, exitCodeId } from './lib/dependencies.js';
import { lockfileModule } from './lib/index.js';

export default launch(
    commandsModule
        .mergeModule(lockfileModule)
        .addBinding(
            bind(EntryScript)
                .withDependencies([LockfileCli])
                .withProvider(cli => cli)
                .scoped(singletonScope)
        )
        .addBinding(
            bind(LockfileCli)
                .withDependencies([commandsId.supplier(), consoleLogId, consoleErrorId, exitCodeId])
                .withConstructorProvider()
                .scoped(singletonScope)
        )
        .toContainer()
);

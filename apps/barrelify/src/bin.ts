import { EntryScript } from 'entry-script';
import { bind, singletonScope } from 'haywire';
import { launch } from 'haywire-launcher';
import { BarrelCli } from './cli.js';
import { commandsId, commandsModule } from './commands/index.js';
import { consoleErrorId, consoleLogId, exitCodeId } from './lib/dependencies.js';
import { FindPackageJson, packageJsonVersionId } from './lib/find-package-json.js';
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
                .withDependencies([
                    commandsId.supplier(),
                    consoleLogId,
                    consoleErrorId,
                    packageJsonVersionId,
                    exitCodeId,
                ])
                .withConstructorProvider()
                .scoped(singletonScope)
        )
        .addBinding(
            bind(packageJsonVersionId)
                .withDependencies([FindPackageJson])
                .withAsyncProvider(async findPackageJson => findPackageJson.getPackageJsonVersion())
                .scoped(singletonScope)
        )
        .toContainer()
);

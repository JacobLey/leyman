import { bind, createContainer, createModule, singletonScope } from 'haywire';
import { Biome } from './biome.js';
import { Formatter } from './formatter.js';
import { biomePath, biomePathId, prettierImport, prettierImportId } from './lib-path.js';
import { Prettier } from './prettier.js';

/**
 * Formatting logic, independent of where (or whether) formatters are installed.
 */
export const formatterModule = createModule(
    bind(Biome)
        .withDependencies([biomePathId.supplier()])
        .withConstructorProvider()
        .scoped(singletonScope)
)
    .addBinding(
        bind(Prettier)
            .withDependencies([prettierImportId.supplier()])
            .withConstructorProvider()
            .scoped(singletonScope)
    )
    .addBinding(
        bind(Formatter)
            .withDependencies([Biome, Prettier])
            .withConstructorProvider()
            .scoped(singletonScope)
    );

/**
 * Where installed formatters are found.
 */
export const formatterPathsModule = createModule(
    bind(biomePathId).withFactory(biomePath)
).addBinding(bind(prettierImportId).withFactory(prettierImport));

export const formatFileContainer = createContainer(
    formatterModule.mergeModule(formatterPathsModule)
);

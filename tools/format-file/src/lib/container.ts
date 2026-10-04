import { bind, createContainer, createModule, singletonScope } from 'haywire';
import { Biome } from './biome.js';
import { Formatter } from './formatter.js';
import { biomePath, biomePathId, prettierPath, prettierPathId } from './lib-path.js';
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
            .withDependencies([prettierPathId.supplier()])
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
 * Locations of installed formatters.
 */
export const formatterPathsModule = createModule(
    bind(biomePathId).withFactory(biomePath)
).addBinding(bind(prettierPathId).withFactory(prettierPath));

export const formatFileContainer = createContainer(
    formatterModule.mergeModule(formatterPathsModule)
);

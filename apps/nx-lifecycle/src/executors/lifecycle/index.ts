import { bind, createContainer, createModule } from 'haystack-di';
import { handler } from 'nx-plugin-handler';
import { dependenciesModule, isCiIdentifier, loggerIdentifier, readFileIdentifier, writeFileIdentifier } from './depedencies.js';
import { Lifecycle } from './lifecycle.js';
import { Normalizer } from './normalizer.js';
import { processNxAndProjectJsons, nxAndProjectJsonProcessorIdentifier } from './processor.js';
import { isNxJson, isNxJsonIdentifier, isProjectJson, isProjectJsonIdentifier } from '#schemas';

const pluginModule = createModule(
    bind(Lifecycle).withConstructorProvider().withDependencies([
        Normalizer,
        readFileIdentifier,
        writeFileIdentifier,
        nxAndProjectJsonProcessorIdentifier,
        isNxJsonIdentifier,
        isProjectJsonIdentifier,
        loggerIdentifier
    ])
).addBinding(
    bind(Normalizer).withConstructorProvider().withDependencies([isCiIdentifier])
).addBinding(
    bind(nxAndProjectJsonProcessorIdentifier).withInstance(processNxAndProjectJsons)
).addBinding(
    bind(isNxJsonIdentifier).withInstance(isNxJson)
).addBinding(
    bind(isProjectJsonIdentifier).withInstance(isProjectJson)
);

const lifecycle = createContainer(
    dependenciesModule.mergeModule(
        pluginModule
    )
).getSync(Lifecycle);

export default handler(lifecycle.lifecycle.bind(lifecycle));